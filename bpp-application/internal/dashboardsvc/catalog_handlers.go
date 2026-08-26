package dashboardsvc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	dbsqlc "github.com/ion/winroom/bpp/db/sqlc"
	"github.com/ion/winroom/bpp/internal/catalog"
)

// ---------------------------------------------------------------------------
// GET /api/v1/catalogs
// Query params: search (matches id / name / provider_id), provider_id (exact), page, limit
// ---------------------------------------------------------------------------

func (h *Handler) HandleListCatalogs(c *gin.Context) {
	page, limit := parsePagination(c)
	search := c.DefaultQuery("search", "")
	providerFilter := c.DefaultQuery("provider_id", "")
	ctx := c.Request.Context()

	countSQL := `
		SELECT COUNT(DISTINCT c.id)
		FROM catalogs c
		WHERE c.bpp_id = $1
		  AND c.deleted_at IS NULL
		  AND ($2 = '' OR c.provider_id = $2)
		  AND ($3 = '' OR c.id ILIKE '%' || $3 || '%'
		                 OR c.descriptor_name ILIKE '%' || $3 || '%'
		                 OR c.provider_id     ILIKE '%' || $3 || '%')`

	var total int64
	if err := h.pool.QueryRow(ctx, countSQL, h.cfg.BppID, providerFilter, search).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	listSQL := `
		SELECT
		    c.id,
		    c.descriptor_name,
		    c.descriptor_short_desc,
		    c.provider_id,
		    c.catalog_type,
		    c.validity_start,
		    c.validity_end,
		    c.created_at,
		    c.network_published_at,
		    COUNT(DISTINCT r.id) AS resource_count,
		    COUNT(DISTINCT o.id) AS offer_count
		FROM catalogs c
		LEFT JOIN resources r ON r.catalog_id = c.id AND r.bpp_id = c.bpp_id AND r.deleted_at IS NULL
		LEFT JOIN offers    o ON o.catalog_id = c.id AND o.bpp_id = c.bpp_id AND o.deleted_at IS NULL
		WHERE c.bpp_id = $1
		  AND c.deleted_at IS NULL
		  AND ($2 = '' OR c.provider_id = $2)
		  AND ($3 = '' OR c.id ILIKE '%' || $3 || '%'
		                 OR c.descriptor_name ILIKE '%' || $3 || '%'
		                 OR c.provider_id     ILIKE '%' || $3 || '%')
		GROUP BY c.id, c.descriptor_name, c.descriptor_short_desc, c.provider_id,
		         c.catalog_type, c.validity_start, c.validity_end, c.created_at, c.network_published_at
		ORDER BY c.created_at DESC
		LIMIT $4 OFFSET $5`

	rows, err := h.pool.Query(ctx, listSQL, h.cfg.BppID, providerFilter, search, limit, (page-1)*limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type catalogRow struct {
		ID                 string  `json:"id"`
		Name               string  `json:"name"`
		ShortDesc          string  `json:"shortDesc"`
		ProviderID         string  `json:"providerId"`
		CatalogType        *string `json:"catalogType"`
		ValidityStart      *string `json:"validityStart"`
		ValidityEnd        *string `json:"validityEnd"`
		CreatedAt          string  `json:"createdAt"`
		NetworkPublishedAt *string `json:"networkPublishedAt"`
		IsPublished        bool    `json:"isPublished"`
		ResourceCount      int64   `json:"resourceCount"`
		OfferCount         int64   `json:"offerCount"`
	}

	items := make([]catalogRow, 0)
	for rows.Next() {
		var row catalogRow
		var catType *string
		var vs, ve, npAt pgtype.Timestamptz
		var sd *string
		var ca pgtype.Timestamptz
		var rc, oc int64

		if err := rows.Scan(&row.ID, &row.Name, &sd, &row.ProviderID, &catType,
			&vs, &ve, &ca, &npAt, &rc, &oc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		row.ShortDesc = ptrStr(sd)
		row.CatalogType = catType
		if vs.Valid {
			s := vs.Time.UTC().Format(time.RFC3339)
			row.ValidityStart = &s
		}
		if ve.Valid {
			s := ve.Time.UTC().Format(time.RFC3339)
			row.ValidityEnd = &s
		}
		if ca.Valid {
			row.CreatedAt = ca.Time.UTC().Format(time.RFC3339)
		}
		if npAt.Valid {
			s := npAt.Time.UTC().Format(time.RFC3339)
			row.NetworkPublishedAt = &s
			row.IsPublished = true
		}
		row.ResourceCount = rc
		row.OfferCount = oc
		items = append(items, row)
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "limit": limit})
}

// ---------------------------------------------------------------------------
// GET /api/v1/providers  — for filter dropdown
// ---------------------------------------------------------------------------

func (h *Handler) HandleListProviders(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.pool.Query(ctx,
		`SELECT id, descriptor_name FROM providers WHERE bpp_id = $1 AND deleted_at IS NULL ORDER BY descriptor_name`,
		h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type prow struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	items := make([]prow, 0)
	for rows.Next() {
		var r prow
		if err := rows.Scan(&r.ID, &r.Name); err != nil {
			continue
		}
		items = append(items, r)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// ---------------------------------------------------------------------------
// POST /api/v1/catalogs  — create / upsert catalog metadata only
// ---------------------------------------------------------------------------

type CreateCatalogRequest struct {
	ID         string `json:"id"         binding:"required"`
	Descriptor struct {
		Name      string `json:"name"      binding:"required"`
		ShortDesc string `json:"shortDesc"`
		LongDesc  string `json:"longDesc"`
	} `json:"descriptor" binding:"required"`
	Provider struct {
		ID         string `json:"id"         binding:"required"`
		Descriptor struct {
			Name string `json:"name" binding:"required"`
		} `json:"descriptor" binding:"required"`
	} `json:"provider" binding:"required"`
	Validity *struct {
		StartDate string `json:"startDate"`
		EndDate   string `json:"endDate"`
	} `json:"validity"`
}

func (h *Handler) HandleCreateCatalog(c *gin.Context) {
	var req CreateCatalogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	q := dbsqlc.New(h.pool)

	// Upsert provider first.
	if err := q.UpsertProvider(ctx, dbsqlc.UpsertProviderParams{
		ID:                   req.Provider.ID,
		BppID:                h.cfg.BppID,
		DescriptorName:       req.Provider.Descriptor.Name,
		DescriptorDocs:       json.RawMessage(`[]`),
		DescriptorMediaFiles: json.RawMessage(`[]`),
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upsert provider: " + err.Error()})
		return
	}

	// Upsert catalog.
	if err := q.UpsertCatalog(ctx, dbsqlc.UpsertCatalogParams{
		ID:              req.ID,
		BppID:           h.cfg.BppID,
		BppUri:          h.cfg.BppURI,
		ProviderID:      req.Provider.ID,
		DescriptorName:  req.Descriptor.Name,
		DescriptorShortDesc: strPtr(req.Descriptor.ShortDesc),
		DescriptorLongDesc:  strPtr(req.Descriptor.LongDesc),
		DescriptorDocs:      json.RawMessage(`[]`),
		DescriptorMediaFiles: json.RawMessage(`[]`),
		CatalogType:     dbsqlc.NullCatalogType{},
		ValidityStart:   parseTS(req.Validity, true),
		ValidityEnd:     parseTS(req.Validity, false),
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upsert catalog: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "id": req.ID})
}

// ---------------------------------------------------------------------------
// GET /api/v1/catalogs/:id  — catalog detail with resources + offers
// ---------------------------------------------------------------------------

func (h *Handler) HandleGetCatalog(c *gin.Context) {
	catalogID := c.Param("id")
	ctx := c.Request.Context()

	// Catalog row.
	var cat struct {
		ID                 string  `json:"id"`
		Name               string  `json:"name"`
		ShortDesc          string  `json:"shortDesc"`
		ProviderID         string  `json:"providerId"`
		ProviderName       string  `json:"providerName"`
		CatalogType        *string `json:"catalogType"`
		ValidityStart      *string `json:"validityStart"`
		ValidityEnd        *string `json:"validityEnd"`
		CreatedAt          string  `json:"createdAt"`
		NetworkPublishedAt *string `json:"networkPublishedAt"`
		IsPublished        bool    `json:"isPublished"`
	}
	var vs, ve, ca, npAt pgtype.Timestamptz
	var sd *string
	var catType *string
	err := h.pool.QueryRow(ctx, `
		SELECT c.id, c.descriptor_name, c.descriptor_short_desc, c.provider_id,
		       COALESCE(p.descriptor_name, c.provider_id),
		       c.catalog_type, c.validity_start, c.validity_end, c.created_at,
		       c.network_published_at
		FROM catalogs c
		LEFT JOIN providers p ON p.id = c.provider_id AND p.bpp_id = c.bpp_id
		WHERE c.id = $1 AND c.bpp_id = $2 AND c.deleted_at IS NULL`,
		catalogID, h.cfg.BppID,
	).Scan(&cat.ID, &cat.Name, &sd, &cat.ProviderID, &cat.ProviderName,
		&catType, &vs, &ve, &ca, &npAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "catalog not found"})
		return
	}
	cat.ShortDesc = ptrStr(sd)
	cat.CatalogType = catType
	if vs.Valid {
		s := vs.Time.UTC().Format(time.RFC3339); cat.ValidityStart = &s
	}
	if ve.Valid {
		s := ve.Time.UTC().Format(time.RFC3339); cat.ValidityEnd = &s
	}
	if ca.Valid {
		cat.CreatedAt = ca.Time.UTC().Format(time.RFC3339)
	}
	if npAt.Valid {
		s := npAt.Time.UTC().Format(time.RFC3339)
		cat.NetworkPublishedAt = &s
		cat.IsPublished = true
	}

	// Resources.
	resRows, err := h.pool.Query(ctx, `
		SELECT r.id, r.descriptor_name, COALESCE(r.descriptor_short_desc,''),
		       r.descriptor_media_files, r.resource_attributes, r.created_at
		FROM resources r
		WHERE r.catalog_id = $1 AND r.bpp_id = $2 AND r.deleted_at IS NULL
		ORDER BY r.created_at`,
		catalogID, h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resRows.Close()

	type resItem struct {
		ID         string          `json:"id"`
		Name       string          `json:"name"`
		ShortDesc  string          `json:"shortDesc"`
		MediaFiles json.RawMessage `json:"mediaFiles"`
		Attributes json.RawMessage `json:"resourceAttributes"`
		CreatedAt  string          `json:"createdAt"`
	}
	resources := make([]resItem, 0)
	for resRows.Next() {
		var r resItem
		var rca pgtype.Timestamptz
		if err := resRows.Scan(&r.ID, &r.Name, &r.ShortDesc, &r.MediaFiles, &r.Attributes, &rca); err != nil {
			continue
		}
		if rca.Valid {
			r.CreatedAt = rca.Time.UTC().Format(time.RFC3339)
		}
		resources = append(resources, r)
	}
	resRows.Close()

	// Offers with consideration price.
	offerRows, err := h.pool.Query(ctx, `
		SELECT o.id, o.descriptor_name, COALESCE(o.descriptor_short_desc,''),
		       o.resource_ids, o.validity_start, o.validity_end,
		       oc.consideration_attributes
		FROM offers o
		LEFT JOIN LATERAL (
		    SELECT oc2.consideration_attributes FROM offer_considerations oc2
		    WHERE oc2.offer_id = o.id AND oc2.bpp_id = o.bpp_id LIMIT 1
		) oc ON TRUE
		WHERE o.catalog_id = $1 AND o.bpp_id = $2 AND o.deleted_at IS NULL
		ORDER BY o.created_at`,
		catalogID, h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer offerRows.Close()

	type offerItem struct {
		ID                      string          `json:"id"`
		Name                    string          `json:"name"`
		ShortDesc               string          `json:"shortDesc"`
		ResourceIDs             []string        `json:"resourceIds"`
		ValidityStart           *string         `json:"validityStart"`
		ValidityEnd             *string         `json:"validityEnd"`
		ConsiderationAttributes json.RawMessage `json:"considerationAttributes"`
	}
	offers := make([]offerItem, 0)
	for offerRows.Next() {
		var o offerItem
		var ovs, ove pgtype.Timestamptz
		var rids []string
		var consAttrs json.RawMessage
		if err := offerRows.Scan(&o.ID, &o.Name, &o.ShortDesc, &rids, &ovs, &ove, &consAttrs); err != nil {
			continue
		}
		o.ResourceIDs = rids
		o.ConsiderationAttributes = consAttrs
		if ovs.Valid {
			s := ovs.Time.UTC().Format(time.RFC3339); o.ValidityStart = &s
		}
		if ove.Valid {
			s := ove.Time.UTC().Format(time.RFC3339); o.ValidityEnd = &s
		}
		offers = append(offers, o)
	}

	c.JSON(http.StatusOK, gin.H{"catalog": cat, "resources": resources, "offers": offers})
}

// ---------------------------------------------------------------------------
// POST /api/v1/catalogs/:id/products  — add a single resource + offer
// ---------------------------------------------------------------------------

type AddProductRequest struct {
	Resource catalog.Resource `json:"resource" binding:"required"`
	Offer    catalog.Offer    `json:"offer"    binding:"required"`
}

func (h *Handler) HandleAddProduct(c *gin.Context) {
	catalogID := c.Param("id")
	var req AddProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := dbsqlc.New(tx)
	bppID := h.cfg.BppID

	// Insert resource.
	mediaJSON, _ := json.Marshal(req.Resource.Descriptor.MediaFile)
	attrsCtx, attrsType := extractContextType(req.Resource.ResourceAttributes)
	if err := q.InsertResource(ctx, dbsqlc.InsertResourceParams{
		ID:                        req.Resource.ID,
		CatalogID:                 catalogID,
		BppID:                     bppID,
		DescriptorName:            strPtr(req.Resource.Descriptor.Name),
		DescriptorCode:            strPtr(req.Resource.Descriptor.Code),
		DescriptorShortDesc:       strPtr(req.Resource.Descriptor.ShortDesc),
		DescriptorLongDesc:        strPtr(req.Resource.Descriptor.LongDesc),
		DescriptorDocs:            json.RawMessage(`[]`),
		DescriptorMediaFiles:      mediaJSON,
		ResourceAttributes:        req.Resource.ResourceAttributes,
		ResourceAttributesContext: strPtr(attrsCtx),
		ResourceAttributesType:    strPtr(attrsType),
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "insert resource: " + err.Error()})
		return
	}

	// Upsert stock.
	if err := q.UpsertResourceStock(ctx, dbsqlc.UpsertResourceStockParams{
		ResourceID: req.Resource.ID,
		BppID:      bppID,
		Quantity:   req.Resource.StockQuantity,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upsert stock: " + err.Error()})
		return
	}

	// Upsert offer provider if provided.
	var offerProviderID *string
	if req.Offer.Provider != nil {
		if err := q.UpsertProvider(ctx, dbsqlc.UpsertProviderParams{
			ID:             req.Offer.Provider.ID,
			BppID:          bppID,
			DescriptorName: req.Offer.Provider.Descriptor.Name,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upsert offer provider: " + err.Error()})
			return
		}
		offerProviderID = strPtr(req.Offer.Provider.ID)
	}

	// Insert offer.
	oAttrsCtx, oAttrsType := extractContextType(req.Offer.OfferAttributes)
	var validityStart, validityEnd pgtype.Timestamptz
	if req.Offer.Validity != nil {
		validityStart = parseTimestampStr(req.Offer.Validity.StartDate)
		validityEnd = parseTimestampStr(req.Offer.Validity.EndDate)
	}
	if err := q.InsertOffer(ctx, dbsqlc.InsertOfferParams{
		ID:                     req.Offer.ID,
		CatalogID:              catalogID,
		BppID:                  bppID,
		ProviderID:             offerProviderID,
		DescriptorName:         strPtr(req.Offer.Descriptor.Name),
		DescriptorCode:         strPtr(req.Offer.Descriptor.Code),
		DescriptorShortDesc:    strPtr(req.Offer.Descriptor.ShortDesc),
		ResourceIds:            req.Offer.ResourceIDs,
		OfferAttributes:        req.Offer.OfferAttributes,
		OfferAttributesContext: strPtr(oAttrsCtx),
		OfferAttributesType:    strPtr(oAttrsType),
		ValidityStart:          validityStart,
		ValidityEnd:            validityEnd,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "insert offer: " + err.Error()})
		return
	}

	// Insert considerations.
	for _, consid := range req.Offer.Considerations {
		cAttrsCtx, cAttrsType := extractContextType(consid.ConsiderationAttributes)
		if err := q.InsertOfferConsideration(ctx, dbsqlc.InsertOfferConsiderationParams{
			OfferID:                        req.Offer.ID,
			CatalogID:                      catalogID,
			BppID:                          bppID,
			ConsiderationID:                consid.ID,
			StatusCode:                     considerationStatusCode(consid.Status),
			StatusName:                     strPtr(consid.Status.Name),
			ConsiderationAttributes:        consid.ConsiderationAttributes,
			ConsiderationAttributesContext: strPtr(cAttrsCtx),
			ConsiderationAttributesType:    strPtr(cAttrsType),
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "insert consideration: " + err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ---------------------------------------------------------------------------
// POST /api/v1/catalogs/:id/publish  — read from DB and forward to CDS
// ---------------------------------------------------------------------------

func (h *Handler) HandlePublishCatalog(c *gin.Context) {
	catalogID := c.Param("id")
	ctx := c.Request.Context()

	if h.cfg.CDSPublishURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CDS_PUBLISH_URL not configured"})
		return
	}

	// Read catalog.
	var cat struct {
		DescriptorName      string
		DescriptorShortDesc *string
		DescriptorLongDesc  *string
		ProviderID          string
		ProviderName        string
		CatalogType         *string
		ValidityStart       pgtype.Timestamptz
		ValidityEnd         pgtype.Timestamptz
	}
	err := h.pool.QueryRow(ctx, `
		SELECT c.descriptor_name, c.descriptor_short_desc, c.descriptor_long_desc,
		       c.provider_id, COALESCE(p.descriptor_name, c.provider_id), c.catalog_type,
		       c.validity_start, c.validity_end
		FROM catalogs c
		LEFT JOIN providers p ON p.id = c.provider_id AND p.bpp_id = c.bpp_id
		WHERE c.id = $1 AND c.bpp_id = $2 AND c.deleted_at IS NULL`,
		catalogID, h.cfg.BppID,
	).Scan(&cat.DescriptorName, &cat.DescriptorShortDesc, &cat.DescriptorLongDesc,
		&cat.ProviderID, &cat.ProviderName, &cat.CatalogType, &cat.ValidityStart, &cat.ValidityEnd)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "catalog not found"})
		return
	}

	// Build catalog.Catalog from DB rows.
	becknCat := catalog.Catalog{
		ID: catalogID,
		Descriptor: catalog.Descriptor{
			Name:      cat.DescriptorName,
			ShortDesc: ptrStr(cat.DescriptorShortDesc),
			LongDesc:  ptrStr(cat.DescriptorLongDesc),
		},
		Provider: catalog.Provider{
			ID:         cat.ProviderID,
			Descriptor: catalog.Descriptor{Name: cat.ProviderName},
		},
	}
	if cat.CatalogType != nil && *cat.CatalogType != "" {
		becknCat.PublishDirectives = &catalog.PublishDirectives{CatalogType: *cat.CatalogType}
	}
	if cat.ValidityStart.Valid && cat.ValidityEnd.Valid {
		becknCat.Validity = &catalog.TimePeriod{
			StartDate: cat.ValidityStart.Time.UTC().Format(time.RFC3339),
			EndDate:   cat.ValidityEnd.Time.UTC().Format(time.RFC3339),
		}
	}

	// Read resources.
	resRows, err := h.pool.Query(ctx, `
		SELECT r.id, r.descriptor_name, COALESCE(r.descriptor_short_desc,''),
		       COALESCE(r.descriptor_long_desc,''), r.descriptor_media_files, r.resource_attributes
		FROM resources r
		WHERE r.catalog_id = $1 AND r.bpp_id = $2 AND r.deleted_at IS NULL`,
		catalogID, h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resRows.Close()

	for resRows.Next() {
		var r catalog.Resource
		var mediaRaw json.RawMessage
		if err := resRows.Scan(&r.ID, &r.Descriptor.Name, &r.Descriptor.ShortDesc,
			&r.Descriptor.LongDesc, &mediaRaw, &r.ResourceAttributes); err != nil {
			continue
		}
		if len(mediaRaw) > 0 && string(mediaRaw) != "[]" && string(mediaRaw) != "null" {
			_ = json.Unmarshal(mediaRaw, &r.Descriptor.MediaFile)
		}
		// Drop entries with a blank uri — the CDS schema requires a valid URI
		// format, and an empty string (no image uploaded yet) fails validation.
		validMedia := r.Descriptor.MediaFile[:0]
		for _, m := range r.Descriptor.MediaFile {
			if strings.TrimSpace(m.URI) != "" {
				validMedia = append(validMedia, m)
			}
		}
		r.Descriptor.MediaFile = validMedia
		becknCat.Resources = append(becknCat.Resources, r)
	}
	resRows.Close()

	// Read offers + considerations.
	offerRows, err := h.pool.Query(ctx, `
		SELECT o.id, o.descriptor_name, COALESCE(o.descriptor_short_desc,''),
		       o.resource_ids, o.offer_attributes, o.validity_start, o.validity_end,
		       COALESCE(op.descriptor_name,''), COALESCE(op.id,'')
		FROM offers o
		LEFT JOIN providers op ON op.id = o.provider_id AND op.bpp_id = o.bpp_id
		WHERE o.catalog_id = $1 AND o.bpp_id = $2 AND o.deleted_at IS NULL`,
		catalogID, h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer offerRows.Close()

	type rawOffer struct {
		offer catalog.Offer
	}
	offerMap := map[string]*rawOffer{}
	offerOrder := []string{}

	for offerRows.Next() {
		var o catalog.Offer
		var rids []string
		var vs, ve pgtype.Timestamptz
		var provName, provID string
		if err := offerRows.Scan(&o.ID, &o.Descriptor.Name, &o.Descriptor.ShortDesc,
			&rids, &o.OfferAttributes, &vs, &ve, &provName, &provID); err != nil {
			continue
		}
		o.ResourceIDs = rids
		if provID != "" {
			o.Provider = &catalog.Provider{
				ID:         provID,
				Descriptor: catalog.Descriptor{Name: provName},
			}
		}
		if vs.Valid && ve.Valid {
			o.Validity = &catalog.TimePeriod{
				StartDate: vs.Time.UTC().Format(time.RFC3339),
				EndDate:   ve.Time.UTC().Format(time.RFC3339),
			}
		}
		offerMap[o.ID] = &rawOffer{offer: o}
		offerOrder = append(offerOrder, o.ID)
	}
	offerRows.Close()

	// Read considerations per offer.
	considRows, err := h.pool.Query(ctx, `
		SELECT offer_id, consideration_id, status_code, COALESCE(status_name,''),
		       consideration_attributes
		FROM offer_considerations
		WHERE catalog_id = $1 AND bpp_id = $2`,
		catalogID, h.cfg.BppID)
	if err == nil {
		defer considRows.Close()
		for considRows.Next() {
			var offerID, considID, statusCode, statusName string
			var attrs json.RawMessage
			if err := considRows.Scan(&offerID, &considID, &statusCode, &statusName, &attrs); err != nil {
				continue
			}
			if ro, ok := offerMap[offerID]; ok {
				ro.offer.Considerations = append(ro.offer.Considerations, catalog.Consideration{
					ID:                      considID,
					Status:                  catalog.Status{Code: statusCode, Name: statusName},
					ConsiderationAttributes: attrs,
				})
			}
		}
	}

	for _, oid := range offerOrder {
		if ro, ok := offerMap[oid]; ok {
			becknCat.Offers = append(becknCat.Offers, ro.offer)
		}
	}

	// Forward to CDS using the same CDSCatalog stripping logic.
	start := time.Now()
	txID := uuid.New()
	msgID := uuid.New()

	becknReq := catalog.OnixPublishRequest{
		Context: catalog.BecknContext{
			Version:       "2.0.0",
			Action:        "catalog/publish",
			Timestamp:     time.Now().UTC().Format(time.RFC3339),
			TransactionID: txID.String(),
			MessageID:     msgID.String(),
			BppID:         h.cfg.BppID,
			BppURI:        h.cfg.BppURI,
			NetworkID:     h.cfg.NetworkID,
		},
		Message: catalog.OnixPublishMessage{
			Catalogs:          []catalog.OnixCatalog{catalog.ToOnixCatalog(becknCat, h.cfg.BppID, h.cfg.BppURI)},
			PublishDirectives: []catalog.OnixPublishDirective{catalog.ToOnixPublishDirective(becknCat)},
		},
	}

	body, _ := json.Marshal(becknReq)

	// respBody and callErr are captured by the deferred audit log below,
	// regardless of which branch returns.
	var respBody []byte
	var callErr error
	defer func() {
		var errMsg *string
		if callErr != nil {
			errMsg = strPtr(callErr.Error())
		}
		ackStatus := dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusACK, Valid: true}
		if callErr != nil {
			ackStatus = dbsqlc.NullAckStatus{AckStatus: dbsqlc.AckStatusNACK, Valid: true}
		}
		dur := int32(time.Since(start).Milliseconds())
		if err := dbsqlc.New(h.pool).InsertMessageLog(context.Background(), dbsqlc.InsertMessageLogParams{
			TransactionID:        pgtype.UUID{Bytes: txID, Valid: true},
			MessageID:            msgID,
			Action:               dbsqlc.BecknActionCatalogPublish,
			Direction:            dbsqlc.MessageDirectionOUTBOUND,
			Url:                  strPtr(h.cfg.CDSPublishURL),
			BppID:                strPtr(h.cfg.BppID),
			BppUri:               strPtr(h.cfg.BppURI),
			NetworkID:            strPtr(h.cfg.NetworkID),
			AckStatus:            ackStatus,
			RequestPayload:       body,
			ResponsePayload:      json.RawMessage(respBody),
			ErrorMessage:         errMsg,
			ProcessingDurationMs: &dur,
		}); err != nil && h.lh != nil {
			h.lh.WithModule("dashboardsvc").Warn().Error(err).Log("failed to write beckn_message_log")
		}
	}()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.CDSPublishURL, bytes.NewReader(body))
	if err != nil {
		callErr = fmt.Errorf("build CDS request: %w", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": callErr.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if h.cfg.BppPrivateKey != "" {
		authHeader, authErr := catalog.BuildAuthHeader(body, h.cfg.BppKeyID, h.cfg.BppPrivateKey)
		if authErr != nil {
			callErr = fmt.Errorf("build auth header: %w", authErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": callErr.Error()})
			return
		}
		httpReq.Header.Set("Authorization", authHeader)
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		callErr = fmt.Errorf("CDS call failed: %w", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": callErr.Error()})
		return
	}
	defer resp.Body.Close() //nolint:errcheck
	respBody, _ = io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		callErr = fmt.Errorf("CDS returned %d: %s", resp.StatusCode, string(respBody))
		c.JSON(http.StatusBadGateway, gin.H{"error": callErr.Error()})
		return
	}

	// Stamp the successful publish time.
	_, _ = h.pool.Exec(ctx,
		`UPDATE catalogs SET network_published_at = NOW() WHERE id = $1 AND bpp_id = $2`,
		catalogID, h.cfg.BppID)

	c.JSON(http.StatusOK, gin.H{"status": "ACK", "message": "Catalog published to CDS"})
}

// ---------------------------------------------------------------------------
// GET /api/v1/inventory/items  — resources grouped with catalog + provider info + optional filters
// ---------------------------------------------------------------------------

func (h *Handler) HandleInventoryItems(c *gin.Context) {
	page, limit   := parsePagination(c)
	catalogFilter := c.DefaultQuery("catalog_id", "")
	providerFilter := c.DefaultQuery("provider_id", "")
	search         := c.DefaultQuery("search", "")
	ctx            := c.Request.Context()

	countSQL := `
		SELECT COUNT(*)
		FROM resources r
		JOIN catalogs c ON c.id = r.catalog_id AND c.bpp_id = r.bpp_id
		WHERE r.bpp_id = $1 AND r.deleted_at IS NULL
		  AND ($2 = '' OR r.catalog_id = $2)
		  AND ($3 = '' OR c.provider_id = $3)
		  AND ($4 = '' OR r.descriptor_name ILIKE '%' || $4 || '%' OR r.id ILIKE '%' || $4 || '%')`

	var total int64
	if err := h.pool.QueryRow(ctx, countSQL, h.cfg.BppID, catalogFilter, providerFilter, search).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	listSQL := `
		SELECT r.id, r.descriptor_name, COALESCE(r.descriptor_short_desc,''),
		       r.catalog_id, c.descriptor_name AS catalog_name,
		       c.provider_id, COALESCE(p.descriptor_name, c.provider_id),
		       COALESCE(rs.quantity, 0), COALESCE(rs.sold, 0),
		       r.created_at
		FROM resources r
		JOIN catalogs c ON c.id = r.catalog_id AND c.bpp_id = r.bpp_id
		LEFT JOIN providers p ON p.id = c.provider_id AND p.bpp_id = r.bpp_id
		LEFT JOIN resource_stock rs ON rs.resource_id = r.id AND rs.bpp_id = r.bpp_id
		WHERE r.bpp_id = $1 AND r.deleted_at IS NULL
		  AND ($2 = '' OR r.catalog_id = $2)
		  AND ($3 = '' OR c.provider_id = $3)
		  AND ($4 = '' OR r.descriptor_name ILIKE '%' || $4 || '%' OR r.id ILIKE '%' || $4 || '%')
		ORDER BY c.provider_id, r.catalog_id, r.descriptor_name
		LIMIT $5 OFFSET $6`

	rows, err := h.pool.Query(ctx, listSQL, h.cfg.BppID, catalogFilter, providerFilter, search, limit, (page-1)*limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type invItem struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		ShortDesc    string `json:"shortDesc"`
		CatalogID    string `json:"catalogId"`
		CatalogName  string `json:"catalogName"`
		ProviderID   string `json:"providerId"`
		ProviderName string `json:"providerName"`
		Stock        int32  `json:"stock"`
		Sold         int32  `json:"sold"`
		CreatedAt    string `json:"createdAt"`
	}

	items := make([]invItem, 0)
	for rows.Next() {
		var item invItem
		var ca pgtype.Timestamptz
		if err := rows.Scan(&item.ID, &item.Name, &item.ShortDesc,
			&item.CatalogID, &item.CatalogName,
			&item.ProviderID, &item.ProviderName,
			&item.Stock, &item.Sold, &ca); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if ca.Valid {
			item.CreatedAt = ca.Time.UTC().Format(time.RFC3339)
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "limit": limit})
}

// ---------------------------------------------------------------------------
// GET /api/v1/catalogs/:id/resources  — list resources for a specific catalog (for offer picker)
// ---------------------------------------------------------------------------

func (h *Handler) HandleGetCatalogResources(c *gin.Context) {
	catalogID := c.Param("id")
	ctx := c.Request.Context()
	rows, err := h.pool.Query(ctx,
		`SELECT id, descriptor_name FROM resources
		 WHERE catalog_id = $1 AND bpp_id = $2 AND deleted_at IS NULL ORDER BY descriptor_name`,
		catalogID, h.cfg.BppID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type r struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	items := make([]r, 0)
	for rows.Next() {
		var x r
		if err := rows.Scan(&x.ID, &x.Name); err != nil {
			continue
		}
		items = append(items, x)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// ---------------------------------------------------------------------------
// POST /api/v1/catalogs/:id/offers  — add a standalone offer to an existing catalog
// ---------------------------------------------------------------------------

func (h *Handler) HandleAddOffer(c *gin.Context) {
	catalogID := c.Param("id")
	var req catalog.Offer
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "offer id is required"})
		return
	}
	ctx := c.Request.Context()

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	qt := dbsqlc.New(tx)

	var offerProviderID *string
	if req.Provider != nil && req.Provider.ID != "" {
		if err := qt.UpsertProvider(ctx, dbsqlc.UpsertProviderParams{
			ID:                   req.Provider.ID,
			BppID:                h.cfg.BppID,
			DescriptorName:       req.Provider.Descriptor.Name,
			DescriptorDocs:       json.RawMessage(`[]`),
			DescriptorMediaFiles: json.RawMessage(`[]`),
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upsert provider: " + err.Error()})
			return
		}
		offerProviderID = strPtr(req.Provider.ID)
	}

	oAttrsCtx, oAttrsType := extractContextType(req.OfferAttributes)
	var validityStart, validityEnd pgtype.Timestamptz
	if req.Validity != nil {
		validityStart = parseTimestampStr(req.Validity.StartDate)
		validityEnd = parseTimestampStr(req.Validity.EndDate)
	}

	if err := qt.InsertOffer(ctx, dbsqlc.InsertOfferParams{
		ID:                     req.ID,
		CatalogID:              catalogID,
		BppID:                  h.cfg.BppID,
		ProviderID:             offerProviderID,
		DescriptorName:         strPtr(req.Descriptor.Name),
		DescriptorCode:         strPtr(req.Descriptor.Code),
		DescriptorShortDesc:    strPtr(req.Descriptor.ShortDesc),
		ResourceIds:            req.ResourceIDs,
		OfferAttributes:        req.OfferAttributes,
		OfferAttributesContext: strPtr(oAttrsCtx),
		OfferAttributesType:    strPtr(oAttrsType),
		ValidityStart:          validityStart,
		ValidityEnd:            validityEnd,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "insert offer: " + err.Error()})
		return
	}

	for _, consid := range req.Considerations {
		cAttrsCtx, cAttrsType := extractContextType(consid.ConsiderationAttributes)
		if err := qt.InsertOfferConsideration(ctx, dbsqlc.InsertOfferConsiderationParams{
			OfferID:                        req.ID,
			CatalogID:                      catalogID,
			BppID:                          h.cfg.BppID,
			ConsiderationID:                consid.ID,
			StatusCode:                     considerationStatusCode(consid.Status),
			StatusName:                     strPtr(consid.Status.Name),
			ConsiderationAttributes:        consid.ConsiderationAttributes,
			ConsiderationAttributesContext: strPtr(cAttrsCtx),
			ConsiderationAttributesType:    strPtr(cAttrsType),
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "insert consideration: " + err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func parseTS(v *struct {
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
}, isStart bool) pgtype.Timestamptz {
	if v == nil {
		return pgtype.Timestamptz{}
	}
	s := v.EndDate
	if isStart {
		s = v.StartDate
	}
	return parseTimestampStr(s)
}

func parseTimestampStr(s string) pgtype.Timestamptz {
	if s == "" {
		return pgtype.Timestamptz{}
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

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

func considerationStatusCode(s catalog.Status) string {
	if s.Code != "" {
		return s.Code
	}
	return s.Name
}
