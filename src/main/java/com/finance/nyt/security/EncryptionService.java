package com.finance.nyt.security;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Versioned AES-256-GCM envelope. Keep historical keys available until data is re-encrypted. */
@Component
public class EncryptionService {
    private static final int NONCE_BYTES = 12;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, SecretKeySpec> keys;
    private final String activeKeyId;

    public EncryptionService(@Value("${app.crypto.active-key-id}") String activeKeyId,
                             @Value("${app.crypto.keys}") String keyConfiguration) {
        var parsed = new HashMap<String, SecretKeySpec>();
        for (String entry : keyConfiguration.split(",")) {
            String[] pair = entry.trim().split(":", 2);
            if (pair.length != 2 || !pair[0].matches("[a-zA-Z0-9_-]{1,32}"))
                throw new IllegalArgumentException("Encryption keys must be id:base64 pairs");
            byte[] raw = Base64.getDecoder().decode(pair[1]);
            if (raw.length != 32 || parsed.putIfAbsent(pair[0], new SecretKeySpec(raw, "AES")) != null)
                throw new IllegalArgumentException("Encryption keys must be unique AES-256 keys");
        }
        if (!parsed.containsKey(activeKeyId)) throw new IllegalArgumentException("Active encryption key is missing");
        this.activeKeyId = activeKeyId;
        this.keys = Map.copyOf(parsed);
    }

    public String encrypt(byte[] plaintext, String context) {
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(plaintext);
            byte[] payload = ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array();
            return "v1." + activeKeyId + "." + Base64.getEncoder().encodeToString(payload);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Encryption failed", e);
        }
    }

    public byte[] decrypt(String envelope, String context) {
        try {
            String[] parts = envelope.split("\\.", 3);
            if (parts.length != 3 || !parts[0].equals("v1") || !keys.containsKey(parts[1]))
                throw new IllegalArgumentException("Unknown encryption envelope");
            byte[] payload = Base64.getDecoder().decode(parts[2]);
            if (payload.length < NONCE_BYTES + 16) throw new IllegalArgumentException("Invalid encryption envelope");
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keys.get(parts[1]), new GCMParameterSpec(128, payload, 0, NONCE_BYTES));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(payload, NONCE_BYTES, payload.length - NONCE_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Decryption failed", e);
        }
    }
}

