package com.finance.nyt.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class BusinessException extends RuntimeException {
    private final HttpStatus status;
    public BusinessException(HttpStatus status, String message) { super(message); this.status = status; }
    public static BusinessException invalid(String message) { return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, message); }
    public static BusinessException conflict(String message) { return new BusinessException(HttpStatus.CONFLICT, message); }
    public static BusinessException forbidden(String message) { return new BusinessException(HttpStatus.FORBIDDEN, message); }
    public static BusinessException missing() { return new BusinessException(HttpStatus.NOT_FOUND, "Resource not found"); }
}

