package com.finance.nyt;

import java.security.SecureRandom;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import com.finance.nyt.service.AuthService;
import com.finance.nyt.dto.AuthDtos;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:auth;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "app.auth.max-failures=2", "app.auth.session-duration=PT1H", "app.auth.lock-duration=PT15M"})
@ActiveProfiles("local")
@AutoConfigureMockMvc
class LocalAuthTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthService auth;
    static String key() { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getEncoder().encodeToString(bytes); }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        String encryption = key(), lookup = key();
        r.add("app.crypto.active-key-id", () -> "auth");
        r.add("app.crypto.keys", () -> "auth:" + encryption);
        r.add("app.auth.lookup-key", () -> lookup);
    }
    private JsonNode register(String email) throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/auth/register").contentType("application/json")
            .content(json.writeValueAsString(Map.of("name", "Portal Customer", "email", email, "password", "a-long-test-password"))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    @Test void registerEncryptsIdentityAndIssuesRevocableSession() throws Exception {
        String email = "owner-" + UUID.randomUUID() + "@test.invalid";
        var session = register(email);
        String token = session.get("token").asText();
        assertThat(token).hasSize(43);
        assertThat(session.get("user").get("roles").get(0).asText()).isEqualTo("CUSTOMER");
        var stored = jdbc.queryForMap("select email, display_name, password_hash from portal_users where id = ?",
            UUID.fromString(session.get("user").get("id").asText()));
        assertThat(stored.get("email").toString()).startsWith("v1.auth.");
        assertThat(stored.get("display_name").toString()).startsWith("v1.auth.");
        assertThat(stored.get("password_hash").toString()).startsWith("$2a$").doesNotContain("test-password");
        assertThat(jdbc.queryForObject("select token_hash from portal_sessions where user_id = ?", String.class,
            UUID.fromString(session.get("user").get("id").asText()))).isNotEqualTo(token).hasSize(64);
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(email));
        mvc.perform(get("/api/v1/applications").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/capabilities").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.maxDocumentBytes").value(5242880));
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
    }
    @Test void authenticationIsCaseInsensitiveAndRejectsDuplicatesInvalidPasswordsAndExpiredTokens() throws Exception {
        String email = "signin-" + UUID.randomUUID() + "@test.invalid";
        var registered = register(email);
        mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(Map.of(
            "name", "Duplicate", "email", email.toUpperCase(Locale.ROOT), "password", "a-long-test-password")))).andExpect(status().isConflict());
        String token = json.readTree(mvc.perform(post("/api/v1/auth/login").contentType("application/json")
            .content(json.writeValueAsString(Map.of("email", email.toUpperCase(Locale.ROOT), "password", "a-long-test-password"))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("token").asText();
        jdbc.update("update portal_sessions set expires_at = ? where user_id = ?", java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(10)),
            UUID.fromString(registered.get("user").get("id").asText()));
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content(json.writeValueAsString(Map.of(
            "email", "unknown@test.invalid", "password", "a-long-test-password")))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content(json.writeValueAsString(Map.of(
            "email", email, "password", "é".repeat(40))))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(Map.of(
            "name", "Invalid", "email", "invalid@test.invalid", "password", "short")))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(Map.of(
            "name", "Invalid", "email", "invalid@test.invalid", "password", "é".repeat(40))))).andExpect(status().isUnprocessableEntity());
        assertThatThrownBy(() -> auth.register(new AuthDtos.Register("short@test.invalid", "Short", "tiny"))).isInstanceOf(RuntimeException.class);
    }
    @Test void failedAttemptsPersistAndLockAccountUntilTimeout() throws Exception {
        String email = "lock-" + UUID.randomUUID() + "@test.invalid"; var session = register(email);
        String id = session.get("user").get("id").asText();
        for (int attempt = 0; attempt < 2; attempt++) mvc.perform(post("/api/v1/auth/login").contentType("application/json")
            .content(json.writeValueAsString(Map.of("email", email, "password", "wrong-password")))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
            .content(json.writeValueAsString(Map.of("email", email, "password", "a-long-test-password")))).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select failed_attempts from portal_users where id = ?", Integer.class, UUID.fromString(id))).isEqualTo(2);
        jdbc.update("update portal_users set locked_until = ? where id = ?", java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(10)), UUID.fromString(id));
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
            .content(json.writeValueAsString(Map.of("email", email, "password", "a-long-test-password")))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select failed_attempts from portal_users where id = ?", Integer.class, UUID.fromString(id))).isZero();
    }
    @Test void onlyAdministratorsCanCreateStaffAndPublicRegistrationCannotAssignRoles() throws Exception {
        String email = "admin-" + UUID.randomUUID() + "@test.invalid";
        auth.bootstrap(email, "Administrator", "a-long-test-password");
        auth.bootstrap(email, "Ignored", "different-test-password");
        var admin = auth.login(new AuthDtos.Login(email, "a-long-test-password"));
        String staffBody = json.writeValueAsString(Map.of("email", "officer-" + UUID.randomUUID() + "@test.invalid",
            "name", "Bank Officer", "password", "a-long-test-password", "role", "OFFICER"));
        mvc.perform(post("/api/v1/admin/users").header("Authorization", "Bearer " + admin.token()).contentType("application/json")
            .content(staffBody)).andExpect(status().isCreated()).andExpect(jsonPath("$.roles[0]").value("OFFICER"));
        mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + admin.token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2));
        var customer = register("customer-" + UUID.randomUUID() + "@test.invalid");
        mvc.perform(post("/api/v1/admin/users").header("Authorization", "Bearer " + customer.get("token").asText()).contentType("application/json")
            .content(staffBody)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(Map.of(
            "email", "attack-" + UUID.randomUUID() + "@test.invalid", "name", "Caller", "password", "a-long-test-password", "role", "ADMIN"))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.user.roles[0]").value("CUSTOMER"));
    }
}
