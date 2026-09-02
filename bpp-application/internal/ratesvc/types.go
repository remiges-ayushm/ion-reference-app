package ratesvc

import "encoding/json"

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

type RateRequest struct {
	Context BecknContext `json:"context"`
	Message RateMessage  `json:"message"`
}

type RateMessage struct {
	RatingInputs []RatingInput `json:"ratingInputs"`
}

// RatingTarget is the entity being rated (order/item/fulfillment/provider/agent).
type RatingTarget struct {
	ID               string          `json:"id,omitempty"`
	Descriptor       json.RawMessage `json:"descriptor,omitempty"`
	TargetAttributes json.RawMessage `json:"targetAttributes,omitempty"`
}

// RatingInput mirrors the Beckn v2 RatingInput schema exactly
// (additionalProperties=false, required: target, range) — no ratingCategory,
// no top-level id/descriptor/feedbackForm; those don't exist in the schema.
type RatingInput struct {
	Target                 RatingTarget    `json:"target"`
	Range                  json.RawMessage `json:"range"`
	FeedbackFormSubmission json.RawMessage `json:"feedbackFormSubmission,omitempty"`
}

type OnRateRequest struct {
	Context BecknContext  `json:"context"`
	Message OnRateMessage `json:"message"`
}

type OnRateMessage struct {
	Ratings []RatingSummary `json:"ratings"`
}

// RatingSummary is the OnRateAction.ratings item — the schema defines it as
// the same shape as RatingInput (required: target, range).
type RatingSummary struct {
	Target RatingTarget    `json:"target"`
	Range  json.RawMessage `json:"range"`
}

type BecknACK struct {
	Context BecknContext `json:"context"`
	Message ACKMessage   `json:"message"`
}

type ACKMessage struct {
	ACK ACKStatus `json:"ack"`
}

type ACKStatus struct {
	Status string `json:"status"`
}
