package com.finance.nyt.repository;

import java.time.Instant;
import java.util.UUID;
import com.finance.nyt.model.DocumentType;
import com.finance.nyt.model.VerificationStatus;

/** Closed projection: listing and policy checks never load encrypted file bodies. */
public interface DocumentMetadata {
    UUID getId();
    DocumentType getType();
    String getMediaType();
    long getSizeBytes();
    VerificationStatus getStatus();
    String getVerificationNote();
    Instant getUploadedAt();
    Instant getVerifiedAt();
}

