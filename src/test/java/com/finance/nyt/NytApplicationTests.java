package com.finance.nyt;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
class NytApplicationTests {
    private static final RSAKey SIGNING_KEY;
    private static final HttpServer JWKS;
    static {
        try {
            SIGNING_KEY = new RSAKeyGenerator(2048).keyID("test-key").generate();
            JWKS = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            JWKS.createContext("/jwks", exchange -> {
                byte[] body = new JWKSet(SIGNING_KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (var stream = exchange.getResponseBody()) { stream.write(body); }
            });
            JWKS.start();
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
        registry.add("app.crypto.active-key-id", () -> "test");
        registry.add("app.crypto.keys", () -> "test:" + Base64.getEncoder().encodeToString(key));
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> "https://identity.test");
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", () -> "http://127.0.0.1:" + JWKS.getAddress().getPort() + "/jwks");
        registry.add("spring.security.oauth2.resourceserver.jwt.audiences", () -> "loan-api");
    }
    @AfterAll static void shutdown() { JWKS.stop(0); }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private <T extends AbstractMockHttpServletRequestBuilder<T>> T as(T request, String subject, String... roles) {
        return request.with(jwt().jwt(j -> j.subject(subject)).authorities(
            Arrays.stream(roles).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toArray(SimpleGrantedAuthority[]::new)));
    }
    private JsonNode result(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }
    private Map<String, Object> productBody() {
        return new HashMap<>(Map.ofEntries(
            Map.entry("code", "LOAN_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(Locale.ROOT)),
            Map.entry("name", "Test installment loan"), Map.entry("currency", "USD"), Map.entry("currencyScale", 2),
            Map.entry("minAmount", 100), Map.entry("maxAmount", 100000), Map.entry("minTermMonths", 1),
            Map.entry("maxTermMonths", 120), Map.entry("annualInterestRate", 12),
            Map.entry("maxDebtToIncomeRatio", new BigDecimal("0.4")), Map.entry("requiredDocuments", List.of("IDENTITY"))));
    }
    private String product() throws Exception {
        return result(mvc.perform(as(post("/api/v1/products"), "admin", "ADMIN")
            .contentType("application/json").content(json.writeValueAsString(productBody()))).andExpect(status().isCreated())).get("id").asText();
    }
    private Map<String, Object> loanBody(String product) {
        return new HashMap<>(Map.of("productId", product, "amount", 1200, "termMonths", 12,
            "monthlyIncome", 2000, "monthlyDebt", 100, "purpose", "Equipment"));
    }
    private String create(String owner, Map<String, Object> body) throws Exception {
        return result(mvc.perform(as(post("/api/v1/applications"), owner, "CUSTOMER")
            .header("Idempotency-Key", UUID.randomUUID()).contentType("application/json")
            .content(json.writeValueAsString(body))).andExpect(status().isCreated())).get("id").asText();
    }
    private String create(String owner) throws Exception { return create(owner, loanBody(product())); }
    private ResultActions upload(String owner, String loan, String type, byte[] bytes) throws Exception {
        var request = multipart("/api/v1/applications/" + loan + "/documents")
            .file(new MockMultipartFile("file", "../../private.html", "text/html", bytes)).param("type", type);
        return mvc.perform(as(request, owner, "CUSTOMER"));
    }
    private String document(String owner, String loan) throws Exception {
        return result(upload(owner, loan, "IDENTITY", "%PDF-1.7\nTest document".getBytes(StandardCharsets.UTF_8))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.mediaType").value("application/pdf"))).get("id").asText();
    }
    private void submit(String owner, String id) throws Exception {
        mvc.perform(as(post("/api/v1/applications/" + id + "/submit"), owner, "CUSTOMER")).andExpect(status().isOk());
    }
    private void review(String officer, String id) throws Exception {
        mvc.perform(as(post("/api/v1/reviews/" + id + "/start"), officer, "OFFICER")).andExpect(status().isOk());
    }
    private ResultActions verify(String officer, String id, String doc, boolean verified) throws Exception {
        return mvc.perform(as(post("/api/v1/applications/" + id + "/documents/" + doc + "/verification"), officer, "OFFICER")
            .contentType("application/json").content(json.writeValueAsString(Map.of("verified", verified, "note", "Reviewed original evidence"))));
    }
    private ResultActions decide(String officer, String id, String outcome) throws Exception {
        return mvc.perform(as(post("/api/v1/reviews/" + id + "/decision"), officer, "OFFICER")
            .contentType("application/json").content(json.writeValueAsString(Map.of("outcome", outcome, "reason", "Documented review conclusion"))));
    }

    @Test void completeWorkflowEncryptsDataAndKeepsHistory() throws Exception {
        String id = create("alice"), doc = document("alice", id);
        var data = jdbc.queryForMap("select amount, monthly_income, purpose from loan_applications where id = ?", UUID.fromString(id));
        assertThat(data.values()).allSatisfy(v -> assertThat(v.toString()).startsWith("v1.test."));
        String encryptedDocument = jdbc.queryForObject("select encrypted_content from loan_documents where id = ?", String.class, UUID.fromString(doc));
        assertThat(encryptedDocument).startsWith("v1.test.").doesNotContain("%PDF");
        mvc.perform(as(get("/api/v1/applications/" + id + "/documents/" + doc + "/content"), "alice", "CUSTOMER"))
            .andExpect(status().isOk()).andExpect(header().string("Content-Type", "application/octet-stream"))
            .andExpect(content().bytes("%PDF-1.7\nTest document".getBytes(StandardCharsets.UTF_8)));
        mvc.perform(as(get("/api/v1/applications/" + id + "/documents"), "alice", "CUSTOMER")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(as(get("/api/v1/applications/" + id), "alice", "CUSTOMER"))
            .andExpect(jsonPath("$.assessment.withinPolicy").value(true)).andExpect(jsonPath("$.purpose").value("Equipment"));
        submit("alice", id); submit("alice", id);
        review("officer", id); review("officer", id);
        decide("officer", id, "APPROVE").andExpect(status().isUnprocessableEntity());
        verify("officer", id, doc, true).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VERIFIED"));
        verify("officer", id, doc, false).andExpect(status().isConflict());
        decide("officer", id, "APPROVE").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        decide("officer", id, "REJECT").andExpect(status().isConflict());
        mvc.perform(as(get("/api/v1/applications/" + id + "/events"), "alice", "CUSTOMER"))
            .andExpect(jsonPath("$.totalElements").value(6)).andExpect(jsonPath("$.content[5].note").value("Documented review conclusion"));
        mvc.perform(as(post("/api/v1/applications/" + id + "/withdraw"), "alice", "CUSTOMER")).andExpect(status().isConflict());
    }

    @Test void permissionsAreEnforcedForEveryRoleAndOwner() throws Exception {
        String id = create("owner"), doc = document("owner", id);
        mvc.perform(get("/api/v1/applications")).andExpect(status().isUnauthorized());
        mvc.perform(as(get("/api/v1/applications/" + id), "other", "CUSTOMER")).andExpect(status().isNotFound());
        mvc.perform(as(get("/api/v1/applications/" + id), "officer", "OFFICER")).andExpect(status().isNotFound());
        mvc.perform(as(get("/api/v1/applications/" + id + "/events"), "other", "CUSTOMER")).andExpect(status().isNotFound());
        mvc.perform(as(get("/api/v1/applications/" + id + "/documents/" + doc + "/content"), "other", "CUSTOMER")).andExpect(status().isNotFound());
        mvc.perform(as(post("/api/v1/applications/" + id + "/submit"), "other", "CUSTOMER")).andExpect(status().isNotFound());
        mvc.perform(as(get("/api/v1/applications"), "officer", "OFFICER")).andExpect(status().isForbidden());
        mvc.perform(as(get("/api/v1/reviews"), "owner", "CUSTOMER")).andExpect(status().isForbidden());
        mvc.perform(as(post("/api/v1/products"), "owner", "CUSTOMER").contentType("application/json")
            .content(json.writeValueAsString(productBody()))).andExpect(status().isForbidden());
        submit("owner", id);
        mvc.perform(as(post("/api/v1/reviews/" + id + "/start"), "owner", "CUSTOMER", "OFFICER")).andExpect(status().isForbidden());
        review("assigned", id);
        verify("different-officer", id, doc, true).andExpect(status().isForbidden());
        decide("different-officer", id, "REJECT").andExpect(status().isForbidden());
        mvc.perform(as(get("/api/v1/applications/" + id), "different-officer", "OFFICER")).andExpect(status().isOk());
        mvc.perform(as(get("/api/v1/applications/" + UUID.randomUUID()), "owner", "CUSTOMER")).andExpect(status().isNotFound());
    }

    @Test void validatesProductsRequestsAndIdempotency() throws Exception {
        String product = product();
        var body = loanBody(product);
        String key = UUID.randomUUID().toString();
        String id = null;
        for (int i = 0; i < 2; i++) {
            var response = result(mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER")
                .header("Idempotency-Key", key).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()));
            if (id == null) id = response.get("id").asText(); else assertThat(response.get("id").asText()).isEqualTo(id);
        }
        body.put("amount", 1300);
        mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER").header("Idempotency-Key", key)
            .contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isConflict());
        for (var invalid : List.of(Map.of("amount", -1), Map.of("monthlyIncome", 0), Map.of("purpose", ""))) {
            var b = loanBody(product); b.putAll(invalid);
            mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER").header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json").content(json.writeValueAsString(b))).andExpect(status().isBadRequest());
        }
        for (var invalid : List.of(Map.of("amount", 99), Map.of("amount", 100001), Map.of("termMonths", 121),
                Map.of("amount", new BigDecimal("1200.001")), Map.of("monthlyIncome", new BigDecimal("2000.001")),
                Map.of("monthlyDebt", new BigDecimal("100.001")))) {
            var b = loanBody(product); b.putAll(invalid);
            mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER").header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json").content(json.writeValueAsString(b))).andExpect(status().isUnprocessableEntity());
        }
        var unknown = loanBody(UUID.randomUUID().toString());
        mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER").header("Idempotency-Key", UUID.randomUUID())
            .contentType("application/json").content(json.writeValueAsString(unknown))).andExpect(status().isNotFound());
        mvc.perform(as(get("/api/v1/applications?size=101"), "retry", "CUSTOMER")).andExpect(status().isBadRequest());
        mvc.perform(as(get("/api/v1/products?page=-1"), "retry", "CUSTOMER")).andExpect(status().isBadRequest());
        for (var invalid : List.of(Map.of("currency", "ZZZ"), Map.of("minAmount", 100001),
                Map.of("minTermMonths", 121), Map.of("minAmount", new BigDecimal("100.001")),
                Map.of("maxAmount", new BigDecimal("100000.001")))) {
            var b = productBody(); b.putAll(invalid);
            mvc.perform(as(post("/api/v1/products"), "admin", "ADMIN").contentType("application/json")
                .content(json.writeValueAsString(b))).andExpect(status().isUnprocessableEntity());
        }
        mvc.perform(as(delete("/api/v1/products/" + product), "admin", "ADMIN")).andExpect(status().isNoContent());
        mvc.perform(as(post("/api/v1/applications"), "retry", "CUSTOMER").header("Idempotency-Key", UUID.randomUUID())
            .contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isUnprocessableEntity());
        document("retry", id);
        mvc.perform(as(post("/api/v1/applications/" + id + "/submit"), "retry", "CUSTOMER")).andExpect(status().isConflict());
        mvc.perform(as(delete("/api/v1/products/" + UUID.randomUUID()), "admin", "ADMIN")).andExpect(status().isNotFound());
    }

    @Test void rejectsInvalidDocumentsAndRestrictsEditsToDrafts() throws Exception {
        String id = create("uploader");
        mvc.perform(as(post("/api/v1/applications/" + id + "/submit"), "uploader", "CUSTOMER")).andExpect(status().isUnprocessableEntity());
        upload("uploader", id, "IDENTITY", new byte[0]).andExpect(status().isUnprocessableEntity());
        upload("uploader", id, "IDENTITY", new byte[5242881]).andExpect(status().isUnprocessableEntity());
        upload("uploader", id, "IDENTITY", "<script>bad</script>".getBytes()).andExpect(status().isUnprocessableEntity());
        String doc = document("uploader", id);
        upload("uploader", id, "IDENTITY", "%PDF-duplicate".getBytes()).andExpect(status().isConflict());
        mvc.perform(as(delete("/api/v1/applications/" + id + "/documents/" + doc), "uploader", "CUSTOMER")).andExpect(status().isNoContent());
        mvc.perform(as(get("/api/v1/applications/" + id + "/documents/" + doc + "/content"), "uploader", "CUSTOMER")).andExpect(status().isNotFound());
        String png = result(upload("uploader", id, "IDENTITY", new byte[]{(byte)137,80,78,71,13,10,26,10})
            .andExpect(status().isCreated())).get("id").asText();
        upload("uploader", id, "INCOME_PROOF", new byte[]{(byte)255,(byte)216,(byte)255,1}).andExpect(status().isCreated());
        String other = create("uploader");
        mvc.perform(as(get("/api/v1/applications/" + other + "/documents/" + png + "/content"), "uploader", "CUSTOMER")).andExpect(status().isNotFound());
        submit("uploader", id);
        upload("uploader", id, "ADDRESS_PROOF", "%PDF-late".getBytes()).andExpect(status().isConflict());
        mvc.perform(as(delete("/api/v1/applications/" + id + "/documents/" + png), "uploader", "CUSTOMER")).andExpect(status().isConflict());
        review("rejecting-officer", id);
        verify("rejecting-officer", id, png, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        decide("rejecting-officer", id, "APPROVE").andExpect(status().isUnprocessableEntity());
        decide("rejecting-officer", id, "REJECT").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test void affordabilityPreventsApprovalButAllowsManualRejection() throws Exception {
        var body = loanBody(product()); body.put("monthlyIncome", 100);
        String id = create("low-income", body), doc = document("low-income", id);
        submit("low-income", id); review("assessor", id);
        verify("assessor", id, doc, true).andExpect(status().isOk());
        decide("assessor", id, "APPROVE").andExpect(status().isUnprocessableEntity());
        decide("assessor", id, "REJECT").andExpect(status().isOk());
    }

    @Test void listsResourcesAndWithdrawsIdempotently() throws Exception {
        String owner = "list-" + UUID.randomUUID(), id = create(owner);
        mvc.perform(as(get("/api/v1/applications"), owner, "CUSTOMER")).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(as(get("/api/v1/products"), owner, "CUSTOMER")).andExpect(status().isOk());
        mvc.perform(as(get("/api/v1/reviews?status=DRAFT"), "officer", "OFFICER")).andExpect(status().isUnprocessableEntity());
        mvc.perform(as(get("/api/v1/reviews"), "officer", "OFFICER")).andExpect(status().isOk());
        for (int i = 0; i < 2; i++) mvc.perform(as(post("/api/v1/applications/" + id + "/withdraw"), owner, "CUSTOMER"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));
        mvc.perform(as(post("/api/v1/applications/" + id + "/submit"), owner, "CUSTOMER")).andExpect(status().isConflict());
        String submitted = create(owner); document(owner, submitted); submit(owner, submitted);
        mvc.perform(as(post("/api/v1/applications/" + submitted + "/withdraw"), owner, "CUSTOMER")).andExpect(status().isOk());
    }

    @Test void concurrentReviewClaimsHaveExactlyOneWinner() throws Exception {
        String id = create("concurrent"); document("concurrent", id); submit("concurrent", id);
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = List.of("first", "second").stream().map(officer -> executor.submit(() -> {
                gate.await();
                return mvc.perform(as(post("/api/v1/reviews/" + id + "/start"), officer, "OFFICER"))
                    .andReturn().getResponse().getStatus();
            })).toList();
            gate.countDown();
            assertThat(List.of(tasks.get(0).get(10, TimeUnit.SECONDS), tasks.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 409);
        }
    }

    private String token(String issuer, String audience, Instant expires, RSAKey key, String subject) throws Exception {
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(),
            new JWTClaimsSet.Builder().issuer(issuer).subject(subject).audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(5))).expirationTime(Date.from(expires))
                .claim("roles", List.of("CUSTOMER")).build());
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }
    @Test void validatesActualJwtSignaturesIssuerAudienceExpiryAndRoles() throws Exception {
        String valid = token("https://identity.test", "loan-api", Instant.now().plusSeconds(300), SIGNING_KEY, "signed-user");
        mvc.perform(get("/api/v1/applications").header("Authorization", "Bearer " + valid)).andExpect(status().isOk());
        for (String bad : List.of(
                token("https://wrong.test", "loan-api", Instant.now().plusSeconds(300), SIGNING_KEY, "signed-user"),
                token("https://identity.test", "wrong-audience", Instant.now().plusSeconds(300), SIGNING_KEY, "signed-user"),
                token("https://identity.test", "loan-api", Instant.now().minusSeconds(300), SIGNING_KEY, "signed-user"),
                token("https://identity.test", "loan-api", Instant.now().plusSeconds(300), new RSAKeyGenerator(2048).generate(), "signed-user"))) {
            mvc.perform(get("/api/v1/applications").header("Authorization", "Bearer " + bad)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/v1/reviews").header("Authorization", "Bearer " + valid)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/applications").header("Authorization", "Bearer " +
            token("https://identity.test", "loan-api", Instant.now().plusSeconds(300), SIGNING_KEY, ""))).andExpect(status().isForbidden());
        mvc.perform(get("/health")).andExpect(status().isOk());
        mvc.perform(as(get("/v3/api-docs"), "admin", "ADMIN")).andExpect(status().isOk()).andExpect(jsonPath("$.openapi").exists());
    }
}
