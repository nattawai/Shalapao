// การจัดหมวด "ชนิดของความล้มเหลว" ที่ layer ล่างสร้างขึ้นเอง — ไม่ใช่ HTTP
// repository โยนชนิดพวกนี้ได้เลย เพราะการบอกว่า failure เป็นชนิดไหนไม่ใช่ business rule
// route เป็นจุดเดียวที่แปลงชนิด → status code · repository ไม่ต้องรู้จักเลข 403/409
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {} // → 400
export class ForbiddenError extends AppError {} //  → 403
export class NotFoundError extends AppError {} //   → 404
export class ConflictError extends AppError {} //   → 409
