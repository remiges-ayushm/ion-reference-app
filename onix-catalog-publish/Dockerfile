FROM fidedocker/catalog-publisher:latest

RUN apk add --no-cache gettext

COPY templates/ /app/templates/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV ENVSUBST_VARS='${REDIS_ADDR} ${NETWORK_PARTICIPANT} ${BPP_ONIX_KEY_ID} ${BPP_ONIX_SIGNING_PRIVATE_KEY} ${BPP_ONIX_SIGNING_PUBLIC_KEY} ${BPP_ONIX_ENCR_PRIVATE_KEY} ${BPP_ONIX_ENCR_PUBLIC_KEY} ${CATALOG_BASE_URL}'

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "./server --config=/app/config/catalog-publish.yaml"]
