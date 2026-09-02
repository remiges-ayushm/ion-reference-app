package initsvc

import "encoding/json"

// ---------------------------------------------------------------------------
// Beckn context (shared by INBOUND init and OUTBOUND on_init)
// ---------------------------------------------------------------------------

type BecknContext struct {
	Version       string `json:"version"`
	Action        string `json:"action"`
	Timestamp     string `json:"timestamp"`
	MessageID     string `json:"messageId"`
	TransactionID string `json:"transactionId"`
	BapID         string `json:"bapId"`
	BapURI        string `json:"bapUri"`
	BppID         string `json:"bppId"`
	BppURI        string `json:"bppUri"`
	TTL           string `json:"ttl,omitempty"`
	NetworkID     string `json:"networkId"`
}

// ---------------------------------------------------------------------------
// INBOUND — BAP → BPP: POST /beckn/init
// ---------------------------------------------------------------------------

type InitRequest struct {
	Context BecknContext `json:"context"`
	Message InitMessage  `json:"message"`
}

type InitMessage struct {
	Contract InitContract `json:"contract"`
}

// InitContract mirrors the Beckn v2.0 Contract structure.
// The BAP may supply an id; if absent the BPP generates one.
// ContractAttributes carries the domain-specific JSON-LD extension bag.
type InitContract struct {
	ID                  string              `json:"id,omitempty"`
	Status              *ContractStatus     `json:"status,omitempty"`
	Participants        []Participant       `json:"participants,omitempty"`
	Commitments         []Commitment        `json:"commitments"`
	Consideration       []Consideration     `json:"consideration,omitempty"`
	Performance         []Performance       `json:"performance,omitempty"`
	ContractAttributes  json.RawMessage     `json:"contractAttributes,omitempty"`
}

// ---------------------------------------------------------------------------
// OUTBOUND — BPP → BAP: POST {bapUri}/on_init
// ---------------------------------------------------------------------------

type OnInitRequest struct {
	Context BecknContext `json:"context"`
	Message OnInitMessage `json:"message"`
}

type OnInitMessage struct {
	Contract InitContract `json:"contract"`
}

// ---------------------------------------------------------------------------
// Synchronous ACK returned to the BAP immediately on POST /beckn/init.
// ---------------------------------------------------------------------------

type BecknACK struct {
	Context BecknContext `json:"context"`
	Message ACKMessage   `json:"message"`
}

type ACKMessage struct {
	ACK ACKStatus `json:"ack"`
}

type ACKStatus struct {
	Status string `json:"status"` // "ACK" | "NACK"
}

// ---------------------------------------------------------------------------
// Contract sub-types
// ---------------------------------------------------------------------------

type ContractStatus struct {
	Code string `json:"code"`
}

type Participant struct {
	ID                    string          `json:"id"`
	Descriptor            *Descriptor     `json:"descriptor,omitempty"`
	ParticipantAttributes json.RawMessage `json:"participantAttributes,omitempty"`
}

type Commitment struct {
	ID                   string            `json:"id"`
	Status               *CommitmentStatus `json:"status,omitempty"`
	Resources            []Resource        `json:"resources,omitempty"`
	Offer                *Offer            `json:"offer,omitempty"`
	CommitmentAttributes json.RawMessage   `json:"commitmentAttributes,omitempty"`
}

type CommitmentStatus struct {
	Descriptor *StatusDescriptor `json:"descriptor,omitempty"`
}

type StatusDescriptor struct {
	Code string `json:"code"`
}

type Resource struct {
	ID                 string          `json:"id"`
	Descriptor         *Descriptor     `json:"descriptor,omitempty"`
	ResourceAttributes json.RawMessage `json:"resourceAttributes,omitempty"`
	Quantity           *quantity       `json:"quantity,omitempty"`
}

type quantity struct {
	UnitCode     string  `json:"unitCode"`
	UnitQuantity float64 `json:"unitQuantity"`
}

type Descriptor struct {
	Name      string `json:"name,omitempty"`
	ShortDesc string `json:"shortDesc,omitempty"`
	LongDesc  string `json:"longDesc,omitempty"`
}

type Offer struct {
	ID              string          `json:"id"`
	ResourceIDs     []string        `json:"resourceIds,omitempty"`
	Descriptor      *Descriptor     `json:"descriptor,omitempty"`
	Provider        *Provider       `json:"provider,omitempty"`
	OfferAttributes json.RawMessage `json:"offerAttributes,omitempty"`
}

type Provider struct {
	ID         string      `json:"id"`
	Descriptor *Descriptor `json:"descriptor,omitempty"`
}

type Consideration struct {
	ID                      string                `json:"id"`
	Status                  *ConsiderationStatus  `json:"status,omitempty"`
	ConsiderationAttributes json.RawMessage       `json:"considerationAttributes,omitempty"`
}

type ConsiderationStatus struct {
	Code string `json:"code"`
}

type Performance struct {
	ID                    string             `json:"id"`
	Status                *PerformanceStatus `json:"status,omitempty"`
	CommitmentIDs         []string           `json:"commitmentIds,omitempty"`
	PerformanceAttributes json.RawMessage    `json:"performanceAttributes,omitempty"`
}

type PerformanceStatus struct {
	Code string `json:"code"`
}
