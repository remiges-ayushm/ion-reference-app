package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/remiges-tech/logharbour/logharbour"

	dbsqlc "github.com/ion/winroom/bpp/db/sqlc"
	"github.com/ion/winroom/bpp/internal/config"
)

// PublishService saves catalog data to the database, forwards it to the CDS,
// and writes an audit entry to beckn_message_log for every message exchanged.
type PublishService struct {
	pool       *pgxpool.Pool
	cfg        *config.Config
	lh         *logharbour.Logger
	httpClient *http.Client
}

func NewPublishService(pool *pgxpool.Pool, cfg *config.Config, lh *logharbour.Logger) *PublishService {
	return &PublishService{
		pool:       pool,
		cfg:        cfg,
		lh:         lh,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// Publish is the main entry point.
//
// It:
//  1. Saves the catalog to the DB inside a transaction.
//  2. Forwards a Beckn-compatible request to the CDS.
//  3. Logs both the INBOUND (provider → BPP) and OUTBOUND (BPP → CDS) messages
//     in beckn_message_log regardless of success or failure.
func (s *PublishService) Publish(ctx context.Context, req *ProviderPublishRequest) (ack *PublishAck, err error) {
	start := time.Now()
	txID := uuid.New()
	inboundMsgID := uuid.New()

	reqJSON, _ := json.Marshal(req)

	// Deferred so the INBOUND log captures the final named-return values of ack and err.
	defer func() {
		s.writeMessageLog(context.Background(), dbsqlc.InsertMessageLogParams{
			TransactionID:        uuidToPgtype(txID),
			MessageID:            inboundMsgID,
			Action:               dbsqlc.BecknActionCatalogPublish,
			Direction:            dbsqlc.MessageDirectionINBOUND,
			Url:                  strPtr("/v1/catalog/publish"),
			BapID:                nil,
			BapUri:               nil,
			BppID:                strPtr(s.cfg.BppID),
			BppUri:               strPtr(s.cfg.BppURI),
			NetworkID:            strPtr(s.cfg.NetworkID),
			AckStatus:            toNullAckStatus(err),
			RequestPayload:       reqJSON,
			ResponsePayload:      marshalOrNull(ack),
			ErrorMessage:         errStrPtr(err),
			ProcessingDurationMs: durationMs(start),
		})
	}()

	if err = s.saveToDB(ctx, req); err != nil {
		return nil, fmt.Errorf("save catalogs to DB: %w", err)
	}

	if err = s.forwardToCDS(ctx, txID, req); err != nil {
		return nil, fmt.Errorf("forward to CDS: %w", err)
	}

	ack = &PublishAck{Status: "ACK", Message: "Catalog published successfully"}
	return ack, nil
}

// saveToDB persists all catalogs in a single transaction.
func (s *PublishService) saveToDB(ctx context.Context, req *ProviderPublishRequest) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := dbsqlc.New(tx)
	for _, cat := range req.Catalogs {
		if err := s.saveCatalogInTx(ctx, q, cat); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *PublishService) saveCatalogInTx(ctx context.Context, q *dbsqlc.Queries, cat Catalog) error {
	bppID := s.cfg.BppID

	if err := upsertProvider(ctx, q, bppID, cat.Provider); err != nil {
		return err
	}
	if err := replaceProviderLocations(ctx, q, bppID, cat.Provider); err != nil {
		return err
	}
	if err := upsertCatalog(ctx, q, bppID, s.cfg.BppURI, cat); err != nil {
		return err
	}
	if err := replaceResources(ctx, q, bppID, cat.ID, cat.Resources); err != nil {
		return err
	}
	return replaceOffers(ctx, q, bppID, cat.ID, cat.Offers)
}

// forwardToCDS builds the Beckn request, sends it to the CDS, and writes the
// OUTBOUND audit log entry (including the full CDS response payload).
// Logging failures are non-fatal.
func (s *PublishService) forwardToCDS(ctx context.Context, txID uuid.UUID, req *ProviderPublishRequest) (err error) {
	if s.cfg.CDSPublishURL == "" {
		s.lh.WithModule("catalog").Log("CDS_PUBLISH_URL not set, skipping CDS forward")
		return nil
	}

	start := time.Now()
	outboundMsgID := uuid.New()

	onixCatalogs := make([]OnixCatalog, len(req.Catalogs))
	directives := make([]OnixPublishDirective, len(req.Catalogs))
	for i, c := range req.Catalogs {
		onixCatalogs[i] = ToOnixCatalog(c, s.cfg.BppID, s.cfg.PublishedBppURI())
		directives[i] = ToOnixPublishDirective(c, s.cfg.BppID)
	}

	becknReq := OnixPublishRequest{
		Context: BecknContext{
			Version:       "2.0.0",
			Action:        "catalog/publish",
			Timestamp:     time.Now().UTC().Format(time.RFC3339),
			TransactionID: txID.String(),
			MessageID:     outboundMsgID.String(),
			BppID:         s.cfg.BppID,
			BppURI:        s.cfg.PublishedBppURI(),
			NetworkID:     s.cfg.NetworkID,
		},
		Message: OnixPublishMessage{Catalogs: onixCatalogs, PublishDirectives: directives},
	}

	becknReqJSON, _ := json.Marshal(becknReq)

	// respBody is populated after the HTTP call and captured by the deferred log.
	var respBody []byte

	defer func() {
		s.writeMessageLog(context.Background(), dbsqlc.InsertMessageLogParams{
			TransactionID:        uuidToPgtype(txID),
			MessageID:            outboundMsgID,
			Action:               dbsqlc.BecknActionCatalogPublish,
			Direction:            dbsqlc.MessageDirectionOUTBOUND,
			Url:                  strPtr(s.cfg.CDSPublishURL),
			BapID:                nil,
			BapUri:               nil,
			BppID:                strPtr(s.cfg.BppID),
			BppUri:               strPtr(s.cfg.BppURI),
			NetworkID:            strPtr(s.cfg.NetworkID),
			AckStatus:            toNullAckStatus(err),
			RequestPayload:       becknReqJSON,
			ResponsePayload:      json.RawMessage(respBody),
			ErrorMessage:         errStrPtr(err),
			ProcessingDurationMs: durationMs(start),
		})
	}()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.CDSPublishURL, bytes.NewReader(becknReqJSON))
	if err != nil {
		return fmt.Errorf("build CDS HTTP request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	if s.cfg.BppPrivateKey != "" {
		authHeader, err := becknAuthHeader(becknReqJSON, s.cfg.BppKeyID, s.cfg.BppPrivateKey)
		if err != nil {
			return fmt.Errorf("build Beckn Authorization header: %w", err)
		}
		httpReq.Header.Set("Authorization", authHeader)
	}

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("CDS HTTP call failed: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	// Always read the body so it is available for the audit log regardless of status.
	respBody, _ = io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("CDS returned non-2xx status %d: %s", resp.StatusCode, string(respBody))
	}

	s.lh.WithModule("catalog").Log("CDS publish forwarded successfully")
	return nil
}

// writeMessageLog inserts one row into beckn_message_log.
// Failures are logged as warnings and never propagate to the caller.
func (s *PublishService) writeMessageLog(ctx context.Context, params dbsqlc.InsertMessageLogParams) {
	q := dbsqlc.New(s.pool)
	if err := q.InsertMessageLog(ctx, params); err != nil {
		s.lh.WithModule("catalog").Warn().Error(err).Log("failed to write beckn_message_log")
	}
}

// ---------------------------------------------------------------------------
// DB helper functions
// ---------------------------------------------------------------------------

func upsertProvider(ctx context.Context, q *dbsqlc.Queries, bppID string, p Provider) error {
	mediaJSON, err := marshalJSON(p.Descriptor.MediaFile)
	if err != nil {
		return fmt.Errorf("marshal media files for provider %s: %w", p.ID, err)
	}
	return q.UpsertProvider(ctx, dbsqlc.UpsertProviderParams{
		ID:                   p.ID,
		BppID:                bppID,
		DescriptorName:       p.Descriptor.Name,
		DescriptorCode:       strPtr(p.Descriptor.Code),
		DescriptorShortDesc:  strPtr(p.Descriptor.ShortDesc),
		DescriptorLongDesc:   strPtr(p.Descriptor.LongDesc),
		DescriptorDocs:       emptyJSONArray,
		DescriptorMediaFiles: mediaJSON,
	})
}

func replaceProviderLocations(ctx context.Context, q *dbsqlc.Queries, bppID string, p Provider) error {
	if err := q.DeleteProviderLocations(ctx, dbsqlc.DeleteProviderLocationsParams{
		ProviderID: p.ID,
		BppID:      bppID,
	}); err != nil {
		return fmt.Errorf("delete locations for provider %s: %w", p.ID, err)
	}

	for _, loc := range p.AvailableAt {
		geoJSON, err := marshalJSON(loc.Geo)
		if err != nil {
			return fmt.Errorf("marshal geo for provider %s: %w", p.ID, err)
		}
		if err := q.InsertProviderLocation(ctx, dbsqlc.InsertProviderLocationParams{
			ProviderID:        p.ID,
			BppID:             bppID,
			Geo:               geoJSON,
			AddressStreet:     strPtr(loc.Address.StreetAddress),
			AddressLocality:   strPtr(loc.Address.AddressLocality),
			AddressRegion:     strPtr(loc.Address.AddressRegion),
			AddressCountry:    strPtr(loc.Address.AddressCountry),
			AddressPostalCode: strPtr(loc.Address.PostalCode),
		}); err != nil {
			return fmt.Errorf("insert location for provider %s: %w", p.ID, err)
		}
	}
	return nil
}

func upsertCatalog(ctx context.Context, q *dbsqlc.Queries, bppID, bppURI string, cat Catalog) error {
	catType := toCatalogType("")
	if cat.PublishDirectives != nil {
		catType = toCatalogType(cat.PublishDirectives.CatalogType)
	}

	mediaJSON, err := marshalJSON(cat.Descriptor.MediaFile)
	if err != nil {
		return fmt.Errorf("marshal media files for catalog %s: %w", cat.ID, err)
	}

	return q.UpsertCatalog(ctx, dbsqlc.UpsertCatalogParams{
		ID:                   cat.ID,
		BppID:                bppID,
		BppUri:               bppURI,
		ProviderID:           cat.Provider.ID,
		DescriptorName:       cat.Descriptor.Name,
		DescriptorCode:       strPtr(cat.Descriptor.Code),
		DescriptorShortDesc:  strPtr(cat.Descriptor.ShortDesc),
		DescriptorLongDesc:   strPtr(cat.Descriptor.LongDesc),
		DescriptorDocs:       emptyJSONArray,
		DescriptorMediaFiles: mediaJSON,
		CatalogType:          catType,
		ValidityStart: parseTimestamp(func() string {
			if cat.Validity != nil {
				return cat.Validity.StartDate
			}
			return ""
		}()),
		ValidityEnd: parseTimestamp(func() string {
			if cat.Validity != nil {
				return cat.Validity.EndDate
			}
			return ""
		}()),
	})
}

func replaceResources(ctx context.Context, q *dbsqlc.Queries, bppID, catalogID string, resources []Resource) error {
	if err := q.DeleteCatalogResources(ctx, dbsqlc.DeleteCatalogResourcesParams{
		CatalogID: catalogID,
		BppID:     bppID,
	}); err != nil {
		return fmt.Errorf("delete resources for catalog %s: %w", catalogID, err)
	}

	for _, res := range resources {
		mediaJSON, err := marshalJSON(res.Descriptor.MediaFile)
		if err != nil {
			return fmt.Errorf("marshal media files for resource %s: %w", res.ID, err)
		}
		attrsCtx, attrsType := extractContextType(res.ResourceAttributes)

		if err := q.InsertResource(ctx, dbsqlc.InsertResourceParams{
			ID:                        res.ID,
			CatalogID:                 catalogID,
			BppID:                     bppID,
			DescriptorName:            strPtr(res.Descriptor.Name),
			DescriptorCode:            strPtr(res.Descriptor.Code),
			DescriptorShortDesc:       strPtr(res.Descriptor.ShortDesc),
			DescriptorLongDesc:        strPtr(res.Descriptor.LongDesc),
			DescriptorDocs:            emptyJSONArray,
			DescriptorMediaFiles:      mediaJSON,
			ResourceAttributes:        res.ResourceAttributes,
			ResourceAttributesContext: strPtr(attrsCtx),
			ResourceAttributesType:    strPtr(attrsType),
		}); err != nil {
			return fmt.Errorf("insert resource %s: %w", res.ID, err)
		}

		// Upsert stock: even if StockQuantity == 0 we write a record so the
		// dashboard can see the resource; a zero means "untracked / unlimited".
		if err := q.UpsertResourceStock(ctx, dbsqlc.UpsertResourceStockParams{
			ResourceID: res.ID,
			BppID:      bppID,
			Quantity:   res.StockQuantity,
		}); err != nil {
			return fmt.Errorf("upsert stock for resource %s: %w", res.ID, err)
		}
	}
	return nil
}

func replaceOffers(ctx context.Context, q *dbsqlc.Queries, bppID, catalogID string, offers []Offer) error {
	if err := q.DeleteCatalogOfferConsiderations(ctx, dbsqlc.DeleteCatalogOfferConsiderationsParams{
		CatalogID: catalogID,
		BppID:     bppID,
	}); err != nil {
		return fmt.Errorf("delete offer considerations for catalog %s: %w", catalogID, err)
	}
	if err := q.DeleteCatalogOffers(ctx, dbsqlc.DeleteCatalogOffersParams{
		CatalogID: catalogID,
		BppID:     bppID,
	}); err != nil {
		return fmt.Errorf("delete offers for catalog %s: %w", catalogID, err)
	}

	for _, offer := range offers {
		var offerProviderID *string
		if offer.Provider != nil {
			if err := upsertProvider(ctx, q, bppID, *offer.Provider); err != nil {
				return err
			}
			if err := replaceProviderLocations(ctx, q, bppID, *offer.Provider); err != nil {
				return err
			}
			offerProviderID = strPtr(offer.Provider.ID)
		}

		attrsCtx, attrsType := extractContextType(offer.OfferAttributes)

		var validityStart, validityEnd pgtype.Timestamptz
		if offer.Validity != nil {
			validityStart = parseTimestamp(offer.Validity.StartDate)
			validityEnd = parseTimestamp(offer.Validity.EndDate)
		}

		if err := q.InsertOffer(ctx, dbsqlc.InsertOfferParams{
			ID:                     offer.ID,
			CatalogID:              catalogID,
			BppID:                  bppID,
			ProviderID:             offerProviderID,
			DescriptorName:         strPtr(offer.Descriptor.Name),
			DescriptorCode:         strPtr(offer.Descriptor.Code),
			DescriptorShortDesc:    strPtr(offer.Descriptor.ShortDesc),
			ResourceIds:            offer.ResourceIDs,
			OfferAttributes:        offer.OfferAttributes,
			OfferAttributesContext: strPtr(attrsCtx),
			OfferAttributesType:    strPtr(attrsType),
			ValidityStart:          validityStart,
			ValidityEnd:            validityEnd,
		}); err != nil {
			return fmt.Errorf("insert offer %s: %w", offer.ID, err)
		}

		for _, consid := range offer.Considerations {
			attrsCtx, attrsType := extractContextType(consid.ConsiderationAttributes)
			if err := q.InsertOfferConsideration(ctx, dbsqlc.InsertOfferConsiderationParams{
				OfferID:                        offer.ID,
				CatalogID:                      catalogID,
				BppID:                          bppID,
				ConsiderationID:                consid.ID,
				StatusCode:                     considerationStatus(consid.Status),
				StatusName:                     strPtr(consid.Status.Name),
				ConsiderationAttributes:        consid.ConsiderationAttributes,
				ConsiderationAttributesContext: strPtr(attrsCtx),
				ConsiderationAttributesType:    strPtr(attrsType),
			}); err != nil {
				return fmt.Errorf("insert consideration %s for offer %s: %w", consid.ID, offer.ID, err)
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

var emptyJSONArray = json.RawMessage(`[]`)

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func marshalJSON(v any) (json.RawMessage, error) {
	if v == nil {
		return emptyJSONArray, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func marshalOrNull(v any) json.RawMessage {
	if v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	return b
}

func toCatalogType(s string) dbsqlc.NullCatalogType {
	switch s {
	case "master":
		return dbsqlc.NullCatalogType{CatalogType: dbsqlc.CatalogTypeMaster, Valid: true}
	case "regular":
		return dbsqlc.NullCatalogType{CatalogType: dbsqlc.CatalogTypeRegular, Valid: true}
	default:
		return dbsqlc.NullCatalogType{}
	}
}

func parseTimestamp(s string) pgtype.Timestamptz {
	if s == "" {
		return pgtype.Timestamptz{}
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

// extractContextType reads @context and @type from a JSONB blob.
func extractContextType(raw json.RawMessage) (contextURL, typeName string) {
	if len(raw) == 0 {
		return "", ""
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return "", ""
	}
	if v, ok := m["@context"]; ok {
		_ = json.Unmarshal(v, &contextURL)
	}
	if v, ok := m["@type"]; ok {
		_ = json.Unmarshal(v, &typeName)
	}
	return
}

// considerationStatus returns a non-empty status code, falling back to status name.
func considerationStatus(s Status) string {
	if s.Code != "" {
		return s.Code
	}
	return s.Name
}

// uuidToPgtype converts a uuid.UUID to the pgtype.UUID used by SQLC for nullable UUIDs.
func uuidToPgtype(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

// toNullAckStatus returns ACK when err is nil, NACK otherwise.
func toNullAckStatus(err error) dbsqlc.NullAckStatus {
	if err == nil {
		return dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusACK, Valid: true}
	}
	return dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusNACK, Valid: true}
}

// errStrPtr returns a pointer to the error string, or nil if err is nil.
func errStrPtr(err error) *string {
	if err == nil {
		return nil
	}
	s := err.Error()
	return &s
}

// durationMs returns the elapsed milliseconds since start as *int32.
func durationMs(start time.Time) *int32 {
	ms := int32(time.Since(start).Milliseconds())
	return &ms
}
