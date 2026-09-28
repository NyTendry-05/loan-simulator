package com.finance.nyt.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.exception.BusinessException;
import com.finance.nyt.model.*;
import com.finance.nyt.repository.DocumentRepository;
import com.finance.nyt.security.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional(readOnly = true)
public class DocumentService {
    private final LoanService loans;
    private final DocumentRepository documents;
    private final EncryptionService encryption;
    private final Clock clock;
    private final long maxBytes;
    public DocumentService(LoanService loans, DocumentRepository documents, EncryptionService encryption,
                           Clock clock, @Value("${app.documents.max-bytes}") long maxBytes) {
        if (maxBytes < 1 || maxBytes >= Integer.MAX_VALUE) throw new IllegalArgumentException("Invalid document size limit");
        this.loans = loans; this.documents = documents; this.encryption = encryption; this.clock = clock; this.maxBytes = maxBytes;
    }
    public List<ApiViews.Document> list(Actor actor, UUID applicationId) {
        loans.readable(actor, applicationId);
        return documents.findByApplicationIdOrderByUploadedAtAsc(applicationId).stream().map(ApiViews.Document::from).toList();
    }

    @Transactional
    public ApiViews.Document upload(Actor actor, UUID applicationId, DocumentType type, MultipartFile file) throws IOException {
        var loan = loans.ownedLocked(actor, applicationId);
        LoanService.requireStatus(loan, LoanStatus.DRAFT);
        if (file.isEmpty() || file.getSize() > maxBytes) throw BusinessException.invalid("Document is empty or exceeds the configured limit");
        byte[] bytes;
        try (var stream = file.getInputStream()) { bytes = stream.readNBytes((int) maxBytes + 1); }
        if (bytes.length == 0 || bytes.length > maxBytes) throw BusinessException.invalid("Document is empty or exceeds the configured limit");
        String mediaType = detectMediaType(bytes);
        UUID id = UUID.randomUUID();
        var document = documents.saveAndFlush(new LoanDocument(id, applicationId, type, mediaType, bytes.length,
            encryption.encrypt(bytes, context(applicationId, id)), clock.instant()));
        loan.touch(clock.instant());
        loans.audit(loan, actor, "DOCUMENT_UPLOADED", type.name());
        return ApiViews.Document.from(document);
    }

    @Transactional
    public void delete(Actor actor, UUID applicationId, UUID documentId) {
        var loan = loans.ownedLocked(actor, applicationId);
        LoanService.requireStatus(loan, LoanStatus.DRAFT);
        documents.delete(document(applicationId, documentId));
        loan.touch(clock.instant());
        loans.audit(loan, actor, "DOCUMENT_REMOVED", documentId.toString());
    }

    public byte[] download(Actor actor, UUID applicationId, UUID documentId) {
        loans.readable(actor, applicationId);
        var document = document(applicationId, documentId);
        return encryption.decrypt(document.getEncryptedContent(), context(applicationId, documentId));
    }

    @Transactional
    public ApiViews.Document verify(Actor actor, UUID applicationId, UUID documentId, VerificationRequest request) {
        var loan = loans.reviewingLocked(actor, applicationId);
        var document = document(applicationId, documentId);
        if (document.getStatus() != VerificationStatus.PENDING) throw BusinessException.conflict("Document already has a verification decision");
        document.verify(request.verified() ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED,
            request.note(), actor.subject(), clock.instant());
        loan.touch(clock.instant());
        loans.audit(loan, actor, "DOCUMENT_" + document.getStatus(), document.getType() + ": " + request.note());
        return ApiViews.Document.from(document);
    }

    private LoanDocument document(UUID applicationId, UUID id) {
        return documents.findById(id).filter(d -> d.getApplicationId().equals(applicationId)).orElseThrow(BusinessException::missing);
    }
    private String context(UUID applicationId, UUID documentId) { return "document:" + applicationId + ":" + documentId; }
    private String detectMediaType(byte[] data) {
        if (startsWith(data, "%PDF-".getBytes(StandardCharsets.US_ASCII))) return "application/pdf";
        if (startsWith(data, new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10})) return "image/png";
        if (startsWith(data, new byte[]{(byte)255, (byte)216, (byte)255})) return "image/jpeg";
        throw BusinessException.invalid("Only PDF, PNG and JPEG document signatures are accepted");
    }
    private boolean startsWith(byte[] data, byte[] prefix) {
        return data.length >= prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }
}

