package com.finance.nyt.controller;

import java.util.List;
import com.finance.nyt.model.DocumentType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
public class CapabilitiesController {
    private final long maxDocumentBytes;
    public CapabilitiesController(@Value("${app.documents.max-bytes}") long maxDocumentBytes) { this.maxDocumentBytes = maxDocumentBytes; }
    @GetMapping("/api/v1/capabilities")
    public Capabilities capabilities() { return new Capabilities(maxDocumentBytes, List.of(DocumentType.values())); }
    public record Capabilities(long maxDocumentBytes, List<DocumentType> documentTypes) {}
}
