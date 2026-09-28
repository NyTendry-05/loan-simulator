package com.finance.nyt.model;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import com.finance.nyt.security.EncryptedStringConverter;

@Entity
@Table(name = "loan_documents", uniqueConstraints = @UniqueConstraint(columnNames = {"application_id", "document_type"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoanDocument {
    @Id private UUID id;
    @Column(nullable = false) private UUID applicationId;
    @Enumerated(EnumType.STRING) @Column(name = "document_type", nullable = false, length = 40) private DocumentType type;
    @Column(nullable = false, length = 80) private String mediaType;
    @Column(nullable = false) private long sizeBytes;
    @Basic(fetch = FetchType.LAZY) @Column(nullable = false, columnDefinition = "text") private String encryptedContent;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private VerificationStatus status;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String verificationNote;
    @Column(length = 200) private String verifiedBy;
    private Instant verifiedAt;
    @Column(nullable = false) private Instant uploadedAt;

    public LoanDocument(UUID id, UUID applicationId, DocumentType type, String mediaType, long size,
                        String encryptedContent, Instant now) {
        this.id = id; this.applicationId = applicationId; this.type = type; this.mediaType = mediaType;
        sizeBytes = size; this.encryptedContent = encryptedContent; status = VerificationStatus.PENDING; uploadedAt = now;
    }
    public void verify(VerificationStatus target, String note, String actor, Instant now) {
        status = target; verificationNote = note; verifiedBy = actor; verifiedAt = now;
    }
}

