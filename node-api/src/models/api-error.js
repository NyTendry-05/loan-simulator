export class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

