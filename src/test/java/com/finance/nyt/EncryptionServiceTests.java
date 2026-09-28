package com.finance.nyt;

import java.security.SecureRandom;
import java.util.Base64;
import java.math.BigDecimal;
import com.finance.nyt.security.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class EncryptionServiceTests {
    private String key() { byte[] k = new byte[32]; new SecureRandom().nextBytes(k); return Base64.getEncoder().encodeToString(k); }
    @Test void authenticatesCiphertextContextAndSupportsKeyRotation() {
        String oldKey = key(), newKey = key();
        var old = new EncryptionService("old", "old:" + oldKey);
        var rotated = new EncryptionService("new", "old:" + oldKey + ",new:" + newKey);
        byte[] content = "confidential".getBytes();
        String first = old.encrypt(content, "document:1");
        assertThat(old.encrypt(content, "document:1")).isNotEqualTo(first);
        assertThat(rotated.decrypt(first, "document:1")).isEqualTo(content);
        assertThat(rotated.encrypt(content, "document:1")).startsWith("v1.new.");
        assertThatThrownBy(() -> rotated.decrypt(first, "document:2")).isInstanceOf(IllegalStateException.class);
        String[] parts = first.split("\\.");
        byte[] changed = Base64.getDecoder().decode(parts[2]); changed[changed.length - 1] ^= 1;
        assertThatThrownBy(() -> old.decrypt("v1.old." + Base64.getEncoder().encodeToString(changed), "document:1"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> old.decrypt("v2.old.AAAA", "document:1")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> old.decrypt("v1.unknown.AAAA", "document:1")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> old.decrypt("v1.old.AAAA", "document:1")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void rejectsInvalidKeysAndRoundTripsNullableConverters() {
        assertThatThrownBy(() -> new EncryptionService("x", "invalid")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EncryptionService("x", "x:AAAA")).isInstanceOf(IllegalArgumentException.class);
        String key = key();
        assertThatThrownBy(() -> new EncryptionService("x", "x:" + key + ",x:" + key)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EncryptionService("y", "x:" + key)).isInstanceOf(IllegalArgumentException.class);
        var encryption = new EncryptionService("x", "x:" + key);
        var strings = new EncryptedStringConverter(encryption);
        var money = new EncryptedMoneyConverter(encryption);
        assertThat(strings.convertToDatabaseColumn(null)).isNull();
        assertThat(strings.convertToEntityAttribute(null)).isNull();
        assertThat(money.convertToDatabaseColumn(null)).isNull();
        assertThat(money.convertToEntityAttribute(null)).isNull();
        assertThat(strings.convertToEntityAttribute(strings.convertToDatabaseColumn("private"))).isEqualTo("private");
        assertThat(money.convertToEntityAttribute(money.convertToDatabaseColumn(new BigDecimal("123.45")))).isEqualByComparingTo("123.45");
    }
}

