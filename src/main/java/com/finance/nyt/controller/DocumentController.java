package com.finance.nyt.controller;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import com.finance.nyt.dto.*;
import com.finance.nyt.model.DocumentType;
import com.finance.nyt.security.Actor;
import com.finance.nyt.service.DocumentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/applications/{applicationId}/documents")
@RequiredArgsConstructor
public class DocumentController {
    private final DocumentService documents;
    @GetMapping
    public List<ApiViews.Document> list(Authentication auth, @PathVariable UUID applicationId) {
        return documents.list(Actor.from(auth), applicationId);
    }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiViews.Document> upload(Authentication auth, @PathVariable UUID applicationId,
        @RequestParam DocumentType type, @RequestPart("file") MultipartFile file) throws IOException {
        var document = documents.upload(Actor.from(auth), applicationId, type, file);
        return ResponseEntity.created(URI.create("/api/v1/applications/" + applicationId + "/documents/" + document.id() + "/content")).body(document);
    }
    @GetMapping("/{documentId}/content")
    public ResponseEntity<byte[]> download(Authentication auth, @PathVariable UUID applicationId, @PathVariable UUID documentId) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(documentId + ".bin").build().toString())
            .cacheControl(CacheControl.noStore())
            .body(documents.download(Actor.from(auth), applicationId, documentId));
    }
    @DeleteMapping("/{documentId}")
    public ResponseEntity<Void> delete(Authentication auth, @PathVariable UUID applicationId, @PathVariable UUID documentId) {
        documents.delete(Actor.from(auth), applicationId, documentId);
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/{documentId}/verification")
    public ApiViews.Document verify(Authentication auth, @PathVariable UUID applicationId, @PathVariable UUID documentId,
        @Valid @RequestBody VerificationRequest request) {
        return documents.verify(Actor.from(auth), applicationId, documentId, request);
    }
}
