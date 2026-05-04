export interface GeneratedCode {
  id: string;
  title: string;
  qr_content: string;
  barcode_content?: string;
  barcode_type?: string;
  qr_size?: number;
  userId: string;
  createdAt: number;
  updatedAt: number;
}
