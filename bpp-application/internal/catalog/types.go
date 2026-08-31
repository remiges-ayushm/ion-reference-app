package catalog

import (
	"encoding/json"
	"strings"
)

// ProviderPublishRequest is what a provider sends to POST /v1/catalog/publish.
// Beckn context fields (bppId, networkId, etc.) are intentionally absent —
// the BPP injects them automatically from its own config before forwarding to the CDS.
type ProviderPublishRequest struct {
	Catalogs []Catalog `json:"catalogs" binding:"required,min=1"`
}

// PublishAck is returned to the provider on success.
type PublishAck struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// BecknPublishRequest is the Beckn-compliant payload sent from the BPP to the CDS.
type BecknPublishRequest struct {
	Context BecknContext        `json:"context"`
	Message BecknPublishMessage `json:"message"`
}

type BecknContext struct {
	Version       string `json:"version"`
	Action        string `json:"action"`
	Timestamp     string `json:"timestamp"`
	TransactionID string `json:"transactionId"`
	MessageID     string `json:"messageId"`
	BppID         string `json:"bppId"`
	BppURI        string `json:"bppUri"`
	NetworkID     string `json:"networkId"`
}

type BecknPublishMessage struct {
	Catalogs []CDSCatalog `json:"catalogs"`
}

// ---------------------------------------------------------------------------
// CDS-safe types — mirrors Catalog/Resource/Offer but strips BPP-internal
// fields (e.g. StockQuantity) that are not part of the Beckn catalog spec
// and would cause the CDS to reject the payload.
// ---------------------------------------------------------------------------

// CDSCatalog intentionally excludes PublishDirectives — that is a BPP-internal
// classification field; sending it (especially catalogType:"master") to the CDS
// causes the catalog to be hidden from regular discover queries.
type CDSCatalog struct {
	ID         string        `json:"id"`
	Descriptor Descriptor    `json:"descriptor"`
	Provider   Provider      `json:"provider"`
	Resources  []CDSResource `json:"resources,omitempty"`
	Offers     []Offer       `json:"offers,omitempty"`
	Validity   *TimePeriod   `json:"validity,omitempty"`
}

// CDSResource is identical to Resource but without the StockQuantity field,
// which is a BPP-internal inventory concept unknown to the CDS.
type CDSResource struct {
	ID                 string          `json:"id"`
	Descriptor         Descriptor      `json:"descriptor"`
	ResourceAttributes json.RawMessage `json:"resourceAttributes,omitempty"`
}

// ToCDSCatalog strips BPP-internal fields (StockQuantity, PublishDirectives)
// from a Catalog before forwarding to the CDS. Exported for use by dashboardsvc.
func ToCDSCatalog(cat Catalog) CDSCatalog {
	cdsResources := make([]CDSResource, len(cat.Resources))
	for i, r := range cat.Resources {
		cdsResources[i] = CDSResource{
			ID:                 r.ID,
			Descriptor:         r.Descriptor,
			ResourceAttributes: r.ResourceAttributes,
		}
	}
	return CDSCatalog{
		ID:         cat.ID,
		Descriptor: cat.Descriptor,
		Provider:   cat.Provider,
		Resources:  cdsResources,
		Offers:     cat.Offers,
		Validity:   cat.Validity,
	}
}

// ---------------------------------------------------------------------------
// onix-catalog-publisher payload types — a separate destination from the CDS
// types above, with its own shape (bppId/bppUri/isActive on the catalog,
// provider+availableAt duplicated per resource, and publishDirectives lifted
// to a top-level array keyed by catalogId). Used only by the provider-facing
// publish path (PublishService.forwardToCDS); the CDS types above are
// untouched and still used by the dashboard publish path.
// ---------------------------------------------------------------------------

type OnixPublishRequest struct {
	Context BecknContext       `json:"context"`
	Message OnixPublishMessage `json:"message"`
}

type OnixPublishMessage struct {
	Catalogs          []OnixCatalog          `json:"catalogs"`
	PublishDirectives []OnixPublishDirective `json:"publishDirectives,omitempty"`
}

type OnixCatalog struct {
	ID         string         `json:"id"`
	BppID      string         `json:"bppId"`
	BppURI     string         `json:"bppUri"`
	IsActive   bool           `json:"isActive"`
	Descriptor Descriptor     `json:"descriptor"`
	Provider   Provider       `json:"provider"`
	Resources  []OnixResource `json:"resources,omitempty"`
	Offers     []Offer        `json:"offers,omitempty"`
	Validity   *TimePeriod    `json:"validity,omitempty"`
}

// OnixResource mirrors Resource but adds provider + availableAt (duplicated
// from the catalog's provider — no per-resource location data exists yet)
// and omits rating (no rating aggregate exists yet) and stockQuantity
// (BPP-internal, same reasoning as CDSResource).
type OnixResource struct {
	ID                 string          `json:"id"`
	Descriptor         Descriptor      `json:"descriptor"`
	ResourceAttributes json.RawMessage `json:"resourceAttributes,omitempty"`
	Provider           *Provider       `json:"provider,omitempty"`
	AvailableAt        []Location      `json:"availableAt,omitempty"`
}

type OnixPublishDirective struct {
	CatalogID   string   `json:"catalogId"`
	VisibleTo   []string `json:"visibleTo,omitempty"`
	CatalogType string   `json:"catalogType,omitempty"`
}

// onixVisibleToNetworks is a hardcoded placeholder for publishDirectives.visibleTo
// until a real per-catalog/config-driven source exists.
var onixVisibleToNetworks = []string{
	"beckn.one/testnet",
	"nfh.global/testnet",
	"ion.id/ion-launch",
}

// ToOnixCatalog converts a Catalog into the shape onix-catalog-publisher
// expects: bppId/bppUri/isActive stamped on the catalog, and the catalog's
// provider (incl. availableAt) duplicated onto every resource.
//
// The catalog id is namespaced as "<bppId>/<catalogId>" — a bare id isn't
// guaranteed unique across the network (two different BPPs could otherwise
// publish colliding catalog ids). Must match ToOnixPublishDirective's
// CatalogID exactly, since the plugin associates a publish directive with
// its catalog by this id.
func ToOnixCatalog(cat Catalog, bppID, bppURI string) OnixCatalog {
	resources := make([]OnixResource, len(cat.Resources))
	for i, r := range cat.Resources {
		provider := cat.Provider
		resources[i] = OnixResource{
			ID:                 r.ID,
			Descriptor:         r.Descriptor,
			ResourceAttributes: r.ResourceAttributes,
			Provider:           &provider,
			AvailableAt:        cat.Provider.AvailableAt,
		}
	}
	return OnixCatalog{
		ID:         bppID + "/" + cat.ID,
		BppID:      bppID,
		BppURI:     bppURI,
		IsActive:   true,
		Descriptor: cat.Descriptor,
		Provider:   cat.Provider,
		Resources:  resources,
		Offers:     cat.Offers,
		Validity:   cat.Validity,
	}
}

// ToOnixPublishDirective builds the top-level publishDirectives entry for
// one catalog, keyed by catalogId so multi-catalog requests produce one
// directive per catalog. bppID must be the same value passed to
// ToOnixCatalog for this catalog — see its doc comment on the id namespacing.
func ToOnixPublishDirective(cat Catalog, bppID string) OnixPublishDirective {
	catalogType := "REGULAR"
	if cat.PublishDirectives != nil && cat.PublishDirectives.CatalogType != "" {
		catalogType = strings.ToUpper(cat.PublishDirectives.CatalogType)
	}
	return OnixPublishDirective{
		CatalogID:   bppID + "/" + cat.ID,
		VisibleTo:   onixVisibleToNetworks,
		CatalogType: catalogType,
	}
}

// ---------------------------------------------------------------------------
// Shared domain types (used in both provider request and CDS forward payload)
// ---------------------------------------------------------------------------

type Catalog struct {
	ID                string             `json:"id"`
	Descriptor        Descriptor         `json:"descriptor"`
	Provider          Provider           `json:"provider"`
	Resources         []Resource         `json:"resources,omitempty"`
	Offers            []Offer            `json:"offers,omitempty"`
	Validity          *TimePeriod        `json:"validity,omitempty"`
	PublishDirectives *PublishDirectives `json:"publishDirectives,omitempty"`
}

type Descriptor struct {
	Name      string      `json:"name"`
	Code      string      `json:"code,omitempty"`
	ShortDesc string      `json:"shortDesc,omitempty"`
	LongDesc  string      `json:"longDesc,omitempty"`
	MediaFile []MediaFile `json:"mediaFile,omitempty"`
}

type MediaFile struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType"`
	Label    string `json:"label,omitempty"`
}

type Provider struct {
	ID          string     `json:"id"`
	Descriptor  Descriptor `json:"descriptor"`
	AvailableAt []Location `json:"availableAt,omitempty"`
}

type Location struct {
	Geo     GeoJSON `json:"geo"`
	Address Address `json:"address"`
}

type GeoJSON struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

type Address struct {
	StreetAddress   string `json:"streetAddress,omitempty"`
	AddressLocality string `json:"addressLocality,omitempty"`
	AddressRegion   string `json:"addressRegion,omitempty"`
	PostalCode      string `json:"postalCode,omitempty"`
	AddressCountry  string `json:"addressCountry,omitempty"`
}

type Resource struct {
	ID                 string          `json:"id"`
	Descriptor         Descriptor      `json:"descriptor"`
	ResourceAttributes json.RawMessage `json:"resourceAttributes,omitempty"`
	// StockQuantity is the initial on-hand stock set by the provider at publish time.
	// Zero means untracked (backwards-compatible with existing payloads).
	StockQuantity int32 `json:"stockQuantity,omitempty"`
}

type Offer struct {
	ID              string          `json:"id"`
	Descriptor      Descriptor      `json:"descriptor"`
	Provider        *Provider       `json:"provider,omitempty"`
	ResourceIDs     []string        `json:"resourceIds"`
	Considerations  []Consideration `json:"considerations,omitempty"`
	Validity        *TimePeriod     `json:"validity,omitempty"`
	OfferAttributes json.RawMessage `json:"offerAttributes,omitempty"`
}

type Consideration struct {
	ID                      string          `json:"id"`
	Status                  Status          `json:"status"`
	ConsiderationAttributes json.RawMessage `json:"considerationAttributes,omitempty"`
}

type Status struct {
	Name string `json:"name"`
	Code string `json:"code,omitempty"`
}

type TimePeriod struct {
	StartDate string `json:"startDate,omitempty"`
	EndDate   string `json:"endDate,omitempty"`
}

type PublishDirectives struct {
	CatalogType string `json:"catalogType,omitempty"`
}
