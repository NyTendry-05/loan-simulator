package com.finance.nyt.repository;
import java.util.*;
import com.finance.nyt.model.LoanDocument;
import org.springframework.data.jpa.repository.JpaRepository;
public interface DocumentRepository extends JpaRepository<LoanDocument, UUID> {
    List<DocumentMetadata> findByApplicationIdOrderByUploadedAtAsc(UUID applicationId);
}
