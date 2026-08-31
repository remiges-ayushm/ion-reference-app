package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the BPP application.
// Values are read from environment variables (populated via .env in development).
type Config struct {
	AppPort string
	AppEnv  string

	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string
	DBSSLMode  string

	// LogLevel controls the minimum priority emitted by logharbour.
	// Accepted values: debug2 | debug1 | debug0 | info | warn | err | crit | sec
	LogLevel string

	// Beckn network identity for this BPP.
	BppID     string // Subscriber ID registered on the Beckn network (e.g. "bpptest1.remiges.tech")
	BppURI    string // Callback URL the BPP exposes to the network (e.g. "https://bpptest1.remiges.tech/bpp/receiver")
	NetworkID string // Beckn network identifier (e.g. "beckn.one/ion-retail")

	// BppCallerURL is the ONIX BPP caller base URL used for outbound on_* callbacks.
	// Example: https://bpptest.remiges.tech/bpp/caller
	// If empty, the service derives it from BppURI by replacing /bpp/receiver with /bpp/caller.
	BppCallerURL string

	// CDSPublishURL is the catalog discovery service endpoint that receives catalog/publish requests.
	CDSPublishURL string

	// CatalogBaseURL is the public, stable domain the DeDi discovery chain is
	// served on (same value onix-catalog-publish uses for its own
	// catalogBaseURL — see terraform/domain-mapping.tf). Optional: this
	// whole custom-domain feature is optional (see README.md), so an empty
	// value here just means PublishedBppURI() falls back to BppURI.
	CatalogBaseURL string

	// BppPrivateKey is the base64-encoded Ed25519 private key (64 bytes) or seed (32 bytes)
	// used to sign outbound Beckn requests. Required when CDSPublishURL is set.
	// Env: BPP_PRIVATE_KEY
	BppPrivateKey string

	// BppKeyID is the Beckn signing key identifier in the format
	// "<subscriberID>|<uniqueKeyID>|ed25519". Env: BPP_KEY_ID
	BppKeyID string
}

// Load reads all config values from the environment and returns a validated Config.
func Load() (*Config, error) {
	cfg := &Config{
		AppPort: getEnv("APP_PORT", "8080"),
		AppEnv:  getEnv("APP_ENV", "development"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBName:     getEnv("DB_NAME", "bpp"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		LogLevel: getEnv("LOG_LEVEL", "info"),

		BppID:        os.Getenv("BPP_ID"),
		BppURI:       os.Getenv("BPP_URI"),
		NetworkID:    os.Getenv("NETWORK_ID"),
		BppCallerURL: os.Getenv("BPP_CALLER_URL"),

		CDSPublishURL:  os.Getenv("CDS_PUBLISH_URL"),
		CatalogBaseURL: os.Getenv("CATALOG_BASE_URL"),

		BppPrivateKey: os.Getenv("BPP_PRIVATE_KEY"),
		BppKeyID:      os.Getenv("BPP_KEY_ID"),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// DatabaseURL builds a pgx-compatible DSN from the config fields.
func (c *Config) DatabaseURL() string {
	return fmt.Sprintf(
		"host=%s port=%s dbname=%s user=%s password=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBName, c.DBUser, c.DBPassword, c.DBSSLMode,
	)
}

// DBPortInt returns the DB port as an integer.
func (c *Config) DBPortInt() int {
	p, _ := strconv.Atoi(c.DBPort)
	return p
}

// IsProduction reports whether the application is running in production mode.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

// PublishedBppURI returns the bppUri to embed in catalog/publish payloads —
// the stable public domain (CatalogBaseURL) with the receiver path appended,
// not BppURI (the Cloud Run URL used for actual select/init/confirm
// routing). Falls back to BppURI if CatalogBaseURL isn't configured.
func (c *Config) PublishedBppURI() string {
	if c.CatalogBaseURL == "" {
		return c.BppURI
	}
	return c.CatalogBaseURL + "/bpp/receiver/"
}

func (c *Config) validate() error {
	if c.DBName == "" {
		return fmt.Errorf("DB_NAME is required")
	}
	if c.DBUser == "" {
		return fmt.Errorf("DB_USER is required")
	}
	if c.BppID == "" {
		return fmt.Errorf("BPP_ID is required")
	}
	if c.BppURI == "" {
		return fmt.Errorf("BPP_URI is required")
	}
	if c.NetworkID == "" {
		return fmt.Errorf("NETWORK_ID is required")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
