package com.finance.nyt.security;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component @ConditionalOnProperty(name = "app.auth.mode", havingValue = "local")
public class LocalIdentity {
    private final byte[] lookupKey;
    private final SecureRandom random = new SecureRandom();
    public LocalIdentity(@Value("${app.auth.lookup-key}") String lookupKey) {
        this.lookupKey = Base64.getDecoder().decode(lookupKey);
        if (this.lookupKey.length != 32) throw new IllegalArgumentException("Auth lookup key must contain 32 bytes");
    }
    public String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    public String emailIndex(String email) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(lookupKey, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(normalizeEmail(email).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) { throw new IllegalStateException("Email indexing failed", e); }
    }
    public String newToken() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public String tokenHash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
}

