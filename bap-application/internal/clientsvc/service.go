package clientsvc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/remiges-tech/logharbour/logharbour"

	dbsqlc "github.com/ion/winroom/bap/db/sqlc"
	"github.com/ion/winroom/bap/internal/config"
)

type ClientService struct {
	pool   *pgxpool.Pool
	cfg    *config.Config
	lh     *logharbour.Logger
	client *http.Client
}

func NewClientService(pool *pgxpool.Pool, cfg *config.Config, lh *logharbour.Logger) *ClientService {
	return &ClientService{
		pool: pool,
		cfg:  cfg,
		lh:   lh,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Discover sends a Beckn v2 `discover` action to the CDS and returns the raw JSON response.
// Logs an OUTBOUND row to beckn_message_log capturing both the request and the CDS response.
func (s *ClientService) Discover(ctx context.Context, req *ClientDiscoverRequest) (json.RawMessage, error) {
	if s.cfg.CDSDiscoverURL == "" {
		return json.RawMessage(`{"message":{"catalogs":[]}}`), nil
	}

	start := time.Now()
	msgID := uuid.New()
	txnID := uuid.New()

	becknReq := map[string]interface{}{
		"context": map[string]interface{}{
			"version":       "2.0.0",
			"action":        "discover",
			"timestamp":     start.UTC().Format(time.RFC3339),
			"messageId":     msgID.String(),
			"transactionId": txnID.String(),
			"bapId":         s.cfg.BapID,
			"bapUri":        s.cfg.BapURI,
			"networkId":     s.cfg.NetworkID,
		},
		"message": map[string]interface{}{
			"intent": map[string]interface{}{
				"textSearch": req.TextSearch,
			},
		},
	}

	reqJSON, _ := json.Marshal(becknReq)

	var (
		respBody   []byte
		callErr    error
		httpStatus int
	)

	// Deferred block: DB log + logharbour ACK/ERR entry.
	defer func() {
		dur := time.Since(start)
		ms := int32(dur.Milliseconds())
		ack := dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusACK, Valid: true}
		if callErr != nil {
			ack = dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusNACK, Valid: true}
			s.logBecknErr("discover", txnID.String(), s.cfg.CDSDiscoverURL, callErr, dur)
		} else {
			s.logBecknAck("discover", txnID.String(), httpStatus, respBody, dur)
		}
		q := dbsqlc.New(s.pool)
		if err := q.InsertMessageLog(ctx, dbsqlc.InsertMessageLogParams{
			TransactionID:        pgtype.UUID{Bytes: txnID, Valid: true},
			MessageID:            msgID,
			Action:               dbsqlc.BecknActionDiscover,
			Direction:            dbsqlc.MessageDirectionOUTBOUND,
			Url:                  strPtr(s.cfg.CDSDiscoverURL),
			BapID:                strPtr(s.cfg.BapID),
			BapUri:               strPtr(s.cfg.BapURI),
			NetworkID:            strPtr(s.cfg.NetworkID),
			AckStatus:            ack,
			RequestPayload:       reqJSON,
			ResponsePayload:      json.RawMessage(respBody),
			ErrorMessage:         errStrPtr(callErr),
			ProcessingDurationMs: &ms,
		}); err != nil {
			s.lh.WithModule("beckn_client").Warn().Error(err).Log("failed to write discover message log")
		}
	}()

	s.logBecknOut("discover", http.MethodGet, s.cfg.CDSDiscoverURL, txnID.String(), msgID.String(), reqJSON)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.CDSDiscoverURL, bytes.NewBuffer(reqJSON))
	if err != nil {
		callErr = fmt.Errorf("build discover request: %w", err)
		return nil, callErr
	}
	httpReq.Header.Set("Content-Type", "application/json")

	if s.cfg.BapPrivateKey != "" {
		authHeader, authErr := becknAuthHeader(reqJSON, s.cfg.BapKeyID, s.cfg.BapPrivateKey)
		if authErr != nil {
			callErr = fmt.Errorf("build Beckn Authorization header: %w", authErr)
			return nil, callErr
		}
		httpReq.Header.Set("Authorization", authHeader)
	}

	resp, err := s.client.Do(httpReq)
	if err != nil {
		callErr = fmt.Errorf("discover HTTP call failed: %w", err)
		return nil, callErr
	}
	defer resp.Body.Close() //nolint:errcheck

	httpStatus = resp.StatusCode

	respBody, err = io.ReadAll(resp.Body)
	if err != nil {
		callErr = fmt.Errorf("read discover response: %w", err)
		return nil, callErr
	}

	if resp.StatusCode != http.StatusOK {
		callErr = fmt.Errorf("CDS returned status %d: %s", resp.StatusCode, string(respBody))
		return nil, callErr
	}

	return respBody, nil
}

// Select initiates a Select action to the ONIX BAP adapter.
// Builds a Beckn v2 message.contract from the frontend's SelectItem list.
// BPP identity is taken from the first item's BppID/BppURI (populated from the
// catalog discover response) so the request is routed to the BPP that owns the
// resource. Server config values are used only as a fallback.
func (s *ClientService) Select(ctx context.Context, req *ClientSelectRequest) (string, error) {
	txnID := uuid.New()
	msgID := uuid.New()

	// Resolve BPP identity from the catalog-supplied values; fall back to config.
	bppID := s.cfg.BppID
	bppURI := s.cfg.BppURI
	if len(req.Items) > 0 {
		if req.Items[0].BppID != "" {
			bppID = req.Items[0].BppID
		}
		if req.Items[0].BppURI != "" {
			bppURI = req.Items[0].BppURI
		}
	}

	msgJSON, err := buildSelectMessage(req.Items, s.cfg.BapID)
	if err != nil {
		return "", fmt.Errorf("build select message: %w", err)
	}

	becknReq := BecknRequest{
		Context: s.newContext("select", txnID.String(), msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}

	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "select", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return "", err
	}

	q := dbsqlc.New(s.pool)
	if err := q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusSELECTSENT,
	}); err != nil {
		s.lh.WithModule("client_svc").Warn().Error(err).Log("upsert transaction failed")
	}

	return txnID.String(), nil
}

// buildSelectMessage constructs the Beckn v2 message.contract JSON for a select call.
func buildSelectMessage(items []SelectItem, bapID string) ([]byte, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("at least one item required")
	}

	// Use first item's provider for the provider participant (single-provider per select).
	providerID := items[0].ProviderID
	if providerID == "" {
		providerID = "provider-default"
	}
	providerName := items[0].ProviderName
	buyerID := "buyer-" + bapID

	// Build commitments, one per item.
	commitments := make([]map[string]interface{}, 0, len(items))
	commitmentIDs := make([]string, 0, len(items))
	for i, item := range items {
		cid := fmt.Sprintf("commitment-%s", item.ResourceID)
		commitmentIDs = append(commitmentIDs, cid)

		qty := item.Quantity
		if qty <= 0 {
			qty = 1
		}

		// Build a sanitized offerAttributes containing only @context, @type and policies.
		// The raw offerAttributes from the CDS discover response may contain fields
		// (e.g. price.applicableQuantity.minValue) that the adapter's strict schema rejects.
		offerAttr := sanitizeOfferAttributes(item.OfferAttributes)

		offerName := item.OfferName
		if offerName == "" {
			offerName = item.ResourceID
		}

		commitments = append(commitments, map[string]interface{}{
			"id":     cid,
			"status": map[string]interface{}{"descriptor": map[string]interface{}{"code": "DRAFT"}},
			"resources": []map[string]interface{}{
				{"id": item.ResourceID, "quantity": map[string]interface{}{"unitCode": "EA", "unitQuantity": qty}},
			},
			"offer": map[string]interface{}{
				"id":          item.OfferID,
				"resourceIds": []string{item.ResourceID},
				"descriptor":  map[string]interface{}{"name": offerName},
				"provider": map[string]interface{}{
					"id":         providerID,
					"descriptor": map[string]interface{}{"name": providerName},
				},
				"offerAttributes": offerAttr,
			},
			"commitmentAttributes": map[string]interface{}{
				"@context":   "https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailCommitment/v2.1/context.jsonld",
				"@type":      "RetailCommitment",
				"lineId":     fmt.Sprintf("LINE-%03d", i+1),
				"resourceId": item.ResourceID,
				"quantity":   map[string]interface{}{"unitCode": "EA", "unitQuantity": qty},
			},
		})
	}

	contract := map[string]interface{}{
		"status": map[string]interface{}{"code": "DRAFT"},
		"participants": []map[string]interface{}{
			{
				"id":          providerID,
				"descriptor":  map[string]interface{}{"name": providerName},
				"participantAttributes": map[string]interface{}{
					"@context": "https://raw.githubusercontent.com/beckn/schemas/main/schema/Provider/v2.1/context.jsonld",
					"@type":    "Provider",
					"id":       providerID,
					"descriptor": map[string]interface{}{
						"name": providerName,
					},
				},
			},
			{
				"id":         buyerID,
				"descriptor": map[string]interface{}{"name": "Buyer"},
				"participantAttributes": map[string]interface{}{
					"@context": "https://raw.githubusercontent.com/beckn/schemas/main/schema/Consumer/v2.0/context.jsonld",
					"@type":    "Consumer",
					"role":     "buyer",
					"person":   map[string]interface{}{"id": buyerID, "name": "Buyer"},
				},
			},
		},
		"commitments": commitments,
		"performance": []map[string]interface{}{
			{
				"id":            "f1",
				"status":        map[string]interface{}{"code": "PENDING"},
				"commitmentIds": commitmentIDs,
				"performanceAttributes": map[string]interface{}{
					"@context": "https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailPerformance/v2.1/context.jsonld",
					"@type":    "rcpa:RetailPerformance",
					"supportedPerformanceModes": []string{"DELIVERY"},
					"deliveryDetails": map[string]interface{}{
						"address": map[string]interface{}{
							"streetAddress":   "TBD",
							"addressLocality": "TBD",
							"addressRegion":   "TBD",
							"postalCode":      "000000",
							"addressCountry":  "IN",
						},
						"contact": map[string]interface{}{
							"name":  "Buyer",
							"phone": "+910000000000",
						},
					},
					"operatingHours": []map[string]interface{}{
						{
							"daysOfWeek": []int{1, 2, 3, 4, 5, 6},
							"timeRange":  map[string]string{"start": "09:00", "end": "21:00"},
						},
					},
					"installationScheduling": map[string]interface{}{"available": false},
				},
			},
		},
	}

	return json.Marshal(map[string]interface{}{"contract": contract})
}

// sanitizeOfferAttributes extracts only @context, @type, and policies from the raw
// offerAttributes discovered via the CDS. The adapter's strict JSON-LD schema rejects
// fields like price.applicableQuantity.minValue that the CDS uses but the adapter does not.
func sanitizeOfferAttributes(raw json.RawMessage) map[string]interface{} {
	const (
		offerCtx  = "https://raw.githubusercontent.com/beckn/local-retail/refs/heads/main/schema/RetailOffer/v2.1/context.jsonld"
		offerType = "RetailOffer"
	)

	out := map[string]interface{}{
		"@context": offerCtx,
		"@type":    offerType,
	}

	if len(raw) <= 2 {
		return out
	}

	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return out
	}

	// Preserve @context / @type from the discover response if present.
	if v, ok := decoded["@context"]; ok {
		var s string
		if json.Unmarshal(v, &s) == nil && s != "" {
			out["@context"] = s
		}
	}
	if v, ok := decoded["@type"]; ok {
		var s string
		if json.Unmarshal(v, &s) == nil && s != "" {
			out["@type"] = s
		}
	}

	// Carry policies through — returns and cancellation are safe per adapter schema.
	if v, ok := decoded["policies"]; ok {
		var policies interface{}
		if json.Unmarshal(v, &policies) == nil {
			out["policies"] = policies
		}
	}

	return out
}

// billingInfo holds the buyer billing details submitted by the frontend.
// Address fields follow Schema.org naming to map directly into the Beckn
// performanceAttributes.deliveryDetails.address structure.
type billingInfo struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	StreetAddress   string `json:"streetAddress"`
	AddressLocality string `json:"addressLocality"`
	AddressRegion   string `json:"addressRegion"`
	PostalCode      string `json:"postalCode"`
	AddressCountry  string `json:"addressCountry"`
}

// Init initiates an Init action to the ONIX BAP adapter.
// It loads the on_select contract snapshot, patches it with the buyer's real
// billing and delivery details, then sends the full contract as message.contract.
func (s *ClientService) Init(ctx context.Context, req *ClientInitRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	// Resolve BPP identity from the stored transaction (set during select).
	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID := s.cfg.BppID
	bppURI := s.cfg.BppURI
	if txn.BppID != nil && *txn.BppID != "" {
		bppID = *txn.BppID
	}
	if txn.BppUri != nil && *txn.BppUri != "" {
		bppURI = *txn.BppUri
	}

	msgJSON, err := s.buildInitMessage(ctx, q, txnID, req)
	if err != nil {
		return fmt.Errorf("build init message: %w", err)
	}

	becknReq := BecknRequest{
		Context: s.newContext("init", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}

	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "init", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}

	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusINITSENT,
	})
}

// buildInitMessage loads the on_select contract snapshot and patches it with real
// buyer billing/delivery details, returning a {"contract": ...} JSON blob.
func (s *ClientService) buildInitMessage(ctx context.Context, q *dbsqlc.Queries, txnID uuid.UUID, req *ClientInitRequest) ([]byte, error) {
	var billing billingInfo
	if err := json.Unmarshal(req.Billing, &billing); err != nil {
		return nil, fmt.Errorf("parse billing: %w", err)
	}

	snapshot, err := q.GetLatestContractSnapshot(ctx, txnID)
	if err != nil || len(snapshot.Contract) == 0 || string(snapshot.Contract) == "null" {
		return nil, fmt.Errorf("no on_select contract snapshot found for txn %s", txnID)
	}

	// Parse as a generic map so we update only the fields we care about while
	// preserving the full BPP-enriched contract (commitments, resources, etc.).
	var contract map[string]interface{}
	if err := json.Unmarshal(snapshot.Contract, &contract); err != nil {
		return nil, fmt.Errorf("parse contract snapshot: %w", err)
	}

	patchBuyerParticipant(contract, s.cfg.BapID, billing)
	patchPerformanceDelivery(contract, billing)

	return json.Marshal(map[string]interface{}{"contract": contract})
}

// patchBuyerParticipant updates the buyer participant's person details with
// the actual billing name and phone number.
func patchBuyerParticipant(contract map[string]interface{}, bapID string, b billingInfo) {
	participants, _ := contract["participants"].([]interface{})
	buyerID := "buyer-" + bapID
	for _, raw := range participants {
		p, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if id, _ := p["id"].(string); id != buyerID {
			continue
		}
		attrs, ok := p["participantAttributes"].(map[string]interface{})
		if !ok {
			attrs = map[string]interface{}{}
			p["participantAttributes"] = attrs
		}
		person, _ := attrs["person"].(map[string]interface{})
		if person == nil {
			person = map[string]interface{}{}
		}
		if b.Name != "" {
			person["name"] = b.Name
		}
		if b.Email != "" {
			person["email"] = b.Email
		}
		if b.Phone != "" {
			person["telephone"] = b.Phone
		}
		attrs["person"] = person
	}
}

// patchPerformanceDelivery replaces the placeholder delivery address and contact
// in every performance block with real values from the buyer's billing form.
func patchPerformanceDelivery(contract map[string]interface{}, b billingInfo) {
	performances, _ := contract["performance"].([]interface{})
	for _, raw := range performances {
		p, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		attrs, ok := p["performanceAttributes"].(map[string]interface{})
		if !ok {
			attrs = map[string]interface{}{}
			p["performanceAttributes"] = attrs
		}
		country := b.AddressCountry
		if country == "" {
			country = "IN"
		}
		attrs["deliveryDetails"] = map[string]interface{}{
			"address": map[string]interface{}{
				"streetAddress":   b.StreetAddress,
				"addressLocality": b.AddressLocality,
				"addressRegion":   b.AddressRegion,
				"postalCode":      b.PostalCode,
				"addressCountry":  country,
			},
			"contact": map[string]interface{}{
				"name":  b.Name,
				"phone": b.Phone,
			},
		}
	}
}

// Confirm initiates a Confirm action to the ONIX BAP adapter.
// It loads the latest contract snapshot (from on_init) and sends the full
// contract as message.contract, satisfying the schema's required commitments field.
func (s *ClientService) Confirm(ctx context.Context, req *ClientConfirmRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	// Resolve BPP identity from the stored transaction.
	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID := s.cfg.BppID
	bppURI := s.cfg.BppURI
	if txn.BppID != nil && *txn.BppID != "" {
		bppID = *txn.BppID
	}
	if txn.BppUri != nil && *txn.BppUri != "" {
		bppURI = *txn.BppUri
	}

	// Load the on_init contract snapshot (most recent, contains BPP-assigned contract id).
	snapshot, err := q.GetLatestContractSnapshot(ctx, txnID)
	if err != nil || len(snapshot.Contract) == 0 || string(snapshot.Contract) == "null" {
		return fmt.Errorf("no contract snapshot found for confirm txn %s", txnID)
	}

	msgJSON, err := json.Marshal(map[string]interface{}{"contract": json.RawMessage(snapshot.Contract)})
	if err != nil {
		return fmt.Errorf("marshal confirm message: %w", err)
	}

	becknReq := BecknRequest{
		Context: s.newContext("confirm", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}

	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "confirm", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}

	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusCONFIRMSENT,
	})
}

// RequestStatus sends a Beckn status request for an active transaction.
func (s *ClientService) RequestStatus(ctx context.Context, req *ClientRequestStatusRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID, bppURI := s.resolveBPP(txn)

	snapshot, err := q.GetLatestContractSnapshot(ctx, txnID)
	if err != nil {
		return fmt.Errorf("no snapshot for txn %s: %w", txnID, err)
	}

	var contract map[string]interface{}
	if err := json.Unmarshal(snapshot.Contract, &contract); err != nil {
		return fmt.Errorf("parse contract snapshot: %w", err)
	}
	contractID, _ := contract["id"].(string)

	msgJSON, _ := json.Marshal(map[string]interface{}{
		"contract": map[string]string{"id": contractID},
	})
	becknReq := BecknRequest{
		Context: s.newContext("status", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}
	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "status", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}
	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusSTATUSSENT,
	})
}

// Cancel sends a Beckn cancel request for an active transaction.
func (s *ClientService) Cancel(ctx context.Context, req *ClientCancelRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID, bppURI := s.resolveBPP(txn)

	snapshot, err := q.GetLatestContractSnapshot(ctx, txnID)
	if err != nil {
		return fmt.Errorf("no snapshot for txn %s: %w", txnID, err)
	}

	// Extract the full contract from the snapshot so the adapter gets
	// the required `commitments` array and other required fields.
	var contractEnvelope struct {
		Message struct {
			Contract json.RawMessage `json:"contract"`
		} `json:"message"`
	}
	var contractPayload json.RawMessage
	if err := json.Unmarshal(snapshot.Contract, &contractEnvelope); err == nil &&
		len(contractEnvelope.Message.Contract) > 2 {
		contractPayload = contractEnvelope.Message.Contract
	} else {
		// Snapshot already IS the contract object (not wrapped in message)
		contractPayload = snapshot.Contract
	}

	msgJSON, _ := json.Marshal(map[string]interface{}{
		"contract": json.RawMessage(contractPayload),
	})
	becknReq := BecknRequest{
		Context: s.newContext("cancel", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}
	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "cancel", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}
	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusCANCELSENT,
	})
}

// Update sends a Beckn update request with partial contract changes.
func (s *ClientService) Update(ctx context.Context, req *ClientUpdateRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID, bppURI := s.resolveBPP(txn)

	msgJSON, _ := json.Marshal(map[string]interface{}{"contract": req.Contract})
	becknReq := BecknRequest{
		Context: s.newContext("update", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}
	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "update", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}
	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusUPDATESENT,
	})
}

// Rate sends a Beckn rate request with the provided rating inputs.
func (s *ClientService) Rate(ctx context.Context, req *ClientRateRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID, bppURI := s.resolveBPP(txn)

	// Wire shape mirrors the Beckn v2 RatingInput schema exactly
	// (additionalProperties=false, required: target, range) — no
	// ratingCategory or top-level id/descriptor; those don't exist in the
	// schema, only target.id/target.descriptor do.
	type ratingTargetWire struct {
		ID         string          `json:"id,omitempty"`
		Descriptor json.RawMessage `json:"descriptor,omitempty"`
	}
	type ratingInputWire struct {
		Target       ratingTargetWire `json:"target"`
		Range        interface{}      `json:"range"`
		FeedbackForm interface{}      `json:"feedbackFormSubmission,omitempty"`
	}
	inputs := make([]ratingInputWire, 0, len(req.RatingInputs))
	for _, ri := range req.RatingInputs {
		w := ratingInputWire{
			Target: ratingTargetWire{ID: ri.ID, Descriptor: ri.Descriptor},
			Range:  ri.Range,
		}
		if ri.FeedbackFormSubmission != nil {
			w.FeedbackForm = ri.FeedbackFormSubmission
		}
		inputs = append(inputs, w)
	}

	msgJSON, _ := json.Marshal(map[string]interface{}{"ratingInputs": inputs})
	becknReq := BecknRequest{
		Context: s.newContext("rate", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}
	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "rate", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}
	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusRATESENT,
	})
}

// Support sends a Beckn support request.
func (s *ClientService) Support(ctx context.Context, req *ClientSupportRequest) error {
	txnID, _ := uuid.Parse(req.TransactionID)
	msgID := uuid.New()
	q := dbsqlc.New(s.pool)

	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return fmt.Errorf("transaction %s not found: %w", req.TransactionID, err)
	}
	bppID, bppURI := s.resolveBPP(txn)

	orderID := req.OrderID
	if orderID == "" {
		orderID = req.TransactionID
	}
	msgJSON, _ := json.Marshal(map[string]interface{}{
		"support": map[string]interface{}{
			"orderId": orderID,
			"descriptor": map[string]string{
				"shortDesc": req.Description,
			},
		},
	})
	becknReq := BecknRequest{
		Context: s.newContext("support", req.TransactionID, msgID.String(), bppID, bppURI),
		Message: json.RawMessage(msgJSON),
	}
	if err := s.sendToBPP(ctx, s.cfg.BapCallerURL, "support", txnID, msgID, s.cfg.NetworkID, becknReq); err != nil {
		return err
	}
	return q.UpsertTransaction(ctx, dbsqlc.UpsertTransactionParams{
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		NetworkID:     &s.cfg.NetworkID,
		BppID:         &bppID,
		BppUri:        &bppURI,
		Status:        dbsqlc.TransactionStatusSUPPORTSENT,
	})
}

// resolveBPP returns the BPP ID and URI for a transaction, falling back to server config.
func (s *ClientService) resolveBPP(txn dbsqlc.Transaction) (bppID, bppURI string) {
	bppID = s.cfg.BppID
	bppURI = s.cfg.BppURI
	if txn.BppID != nil && *txn.BppID != "" {
		bppID = *txn.BppID
	}
	if txn.BppUri != nil && *txn.BppUri != "" {
		bppURI = *txn.BppUri
	}
	return
}

// GetStatus returns the latest state for a transaction.
func (s *ClientService) GetStatus(ctx context.Context, txnIDStr string) (*ClientStatusResponse, error) {
	txnID, err := uuid.Parse(txnIDStr)
	if err != nil {
		return nil, err
	}

	q := dbsqlc.New(s.pool)
	txn, err := q.GetTransaction(ctx, txnID)
	if err != nil {
		return nil, err
	}

	// Get latest snapshot if available
	snapshot, _ := q.GetLatestContractSnapshot(ctx, txnID)

	resp := &ClientStatusResponse{
		TransactionID: txnIDStr,
		Status:        string(txn.Status),
		UpdatedAt:     txn.UpdatedAt.Time,
	}

	if snapshot.ID != [16]byte{} {
		resp.Contract = snapshot.Contract
	}

	return resp, nil
}

// GetCatalog returns a mock catalog (for now) or triggers a search.
func (s *ClientService) GetCatalog(ctx context.Context) (json.RawMessage, error) {
	// Simple mock food catalog for the Instamart-style UI.
	return json.RawMessage(`[
		{"id":"p1","name":"Organic Avocados","price":120,"category":"Produce","image":"https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&auto=format&fit=crop&q=60"},
		{"id":"p2","name":"Oat Milk (1L)","price":250,"category":"Dairy","image":"https://images.unsplash.com/photo-1634140785135-2465e9754ce4?w=400&auto=format&fit=crop&q=60"},
		{"id":"p3","name":"Greek Yogurt","price":80,"category":"Dairy","image":"https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&auto=format&fit=crop&q=60"},
		{"id":"p4","name":"Whole Wheat Bread","price":45,"category":"Bakery","image":"https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&auto=format&fit=crop&q=60"},
		{"id":"p5","name":"Dark Chocolate (70%)","price":150,"category":"Snacks","image":"https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&auto=format&fit=crop&q=60"}
	]`), nil
}

// --- Helpers ---

func (s *ClientService) newContext(action, txnID, msgID, bppID, bppURI string) BecknContext {
	return BecknContext{
		Version:       "2.0.0",
		Action:        action,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		MessageID:     msgID,
		TransactionID: txnID,
		BapID:         s.cfg.BapID,
		BapURI:        s.cfg.BapURI,
		BppID:         bppID,
		BppURI:        bppURI,
		NetworkID:     s.cfg.NetworkID,
		TTL:           "PT30S",
	}
}

// sendToBPP transmits a Beckn request to the ONIX adapter and logs both the
// outbound request and the adapter ACK response to beckn_message_log and logharbour.
func (s *ClientService) sendToBPP(ctx context.Context, callerURL, action string, txnID, msgID uuid.UUID, networkID string, req BecknRequest) error {
	targetURL := fmt.Sprintf("%s/%s", callerURL, action)
	reqJSON, _ := json.Marshal(req)

	start := time.Now()

	var (
		respBody   []byte
		callErr    error
		httpStatus int
	)

	// Deferred block: DB log + logharbour ACK/ERR entry.
	defer func() {
		dur := time.Since(start)
		ms := int32(dur.Milliseconds())
		ack := dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusACK, Valid: true}
		if callErr != nil {
			ack = dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusNACK, Valid: true}
			s.logBecknErr(action, txnID.String(), targetURL, callErr, dur)
		} else {
			s.logBecknAck(action, txnID.String(), httpStatus, respBody, dur)
		}
		q := dbsqlc.New(s.pool)
		if err := q.InsertMessageLog(ctx, dbsqlc.InsertMessageLogParams{
			TransactionID:        pgtype.UUID{Bytes: txnID, Valid: true},
			MessageID:            msgID,
			Action:               dbsqlc.BecknAction(action),
			Direction:            dbsqlc.MessageDirectionOUTBOUND,
			Url:                  strPtr(targetURL),
			BapID:                strPtr(s.cfg.BapID),
			BapUri:               strPtr(s.cfg.BapURI),
			BppID:                strPtr(req.Context.BppID),
			BppUri:               strPtr(req.Context.BppURI),
			NetworkID:            &networkID,
			AckStatus:            ack,
			RequestPayload:       reqJSON,
			ResponsePayload:      json.RawMessage(respBody),
			ErrorMessage:         errStrPtr(callErr),
			ProcessingDurationMs: &ms,
		}); err != nil {
			s.lh.WithModule("beckn_client").Warn().Error(err).Log("failed to log outbound message")
		}
	}()

	s.logBecknOut(action, http.MethodPost, targetURL, txnID.String(), msgID.String(), reqJSON)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewBuffer(reqJSON))
	if err != nil {
		callErr = err
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		callErr = err
		return err
	}
	defer resp.Body.Close() //nolint:errcheck

	httpStatus = resp.StatusCode
	respBody, _ = io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		callErr = fmt.Errorf("adapter returned status %d: %s", resp.StatusCode, string(respBody))
		return callErr
	}

	return nil
}

// --- Beckn call structured logging helpers ---

// becknOutActivity is the structured payload recorded before an outbound Beckn call.
type becknOutActivity struct {
	Action  string          `json:"action"`
	Method  string          `json:"method"`
	URL     string          `json:"url"`
	TxnID   string          `json:"txn_id"`
	MsgID   string          `json:"msg_id"`
	Request json.RawMessage `json:"request"`
}

// becknAckActivity is the structured payload recorded after a successful Beckn call.
type becknAckActivity struct {
	Action   string          `json:"action"`
	TxnID    string          `json:"txn_id"`
	HTTPCode int             `json:"http_code"`
	DurMs    int64           `json:"dur_ms"`
	Response json.RawMessage `json:"response"`
}

// becknErrActivity is the structured payload recorded when a Beckn call fails.
type becknErrActivity struct {
	Action string `json:"action"`
	TxnID  string `json:"txn_id"`
	URL    string `json:"url"`
	DurMs  int64  `json:"dur_ms"`
	Error  string `json:"error"`
}

// logBecknOut prints the outbound Beckn request as pretty JSON to stdout.
func (s *ClientService) logBecknOut(action, method, url, txnID, msgID string, body []byte) {
	entry := becknOutActivity{
		Action:  action,
		Method:  method,
		URL:     url,
		TxnID:   txnID,
		MsgID:   msgID,
		Request: json.RawMessage(body),
	}
	prettyLog(fmt.Sprintf("→ OUT  %-8s | txn=%.8s… | %s %s", strings.ToUpper(action), txnID, method, url), entry)
}

// logBecknAck prints the Beckn adapter ACK response as pretty JSON to stdout.
func (s *ClientService) logBecknAck(action, txnID string, status int, body []byte, dur time.Duration) {
	entry := becknAckActivity{
		Action:   action,
		TxnID:    txnID,
		HTTPCode: status,
		DurMs:    dur.Milliseconds(),
		Response: json.RawMessage(body),
	}
	prettyLog(fmt.Sprintf("← ACK  %-8s | txn=%.8s… | http=%d | dur=%dms", strings.ToUpper(action), txnID, status, dur.Milliseconds()), entry)
}

// logBecknErr prints the Beckn call failure as pretty JSON to stdout.
func (s *ClientService) logBecknErr(action, txnID, url string, callErr error, dur time.Duration) {
	entry := becknErrActivity{
		Action: action,
		TxnID:  txnID,
		URL:    url,
		DurMs:  dur.Milliseconds(),
		Error:  callErr.Error(),
	}
	prettyLog(fmt.Sprintf("← ERR  %-8s | txn=%.8s… | dur=%dms | %s", strings.ToUpper(action), txnID, dur.Milliseconds(), callErr.Error()), entry)
}

// prettyLog prints a labelled pretty-JSON block to stdout via the standard log package.
func prettyLog(label string, v interface{}) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		log.Printf("[beckn] %s\n(marshal error: %v)", label, err)
		return
	}
	log.Printf("[beckn] %s\n%s", label, string(b))
}

// --- Generic helpers ---

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func errStrPtr(err error) *string {
	if err == nil {
		return nil
	}
	s := err.Error()
	return &s
}
