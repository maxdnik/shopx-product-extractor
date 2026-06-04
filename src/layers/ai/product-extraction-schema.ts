import { z } from 'zod';

export const aiExtractedFieldSchema = z.object({
  value: z.unknown().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1)
});

export const aiProductExtractionSchema = z.object({
  title: aiExtractedFieldSchema.optional(),
  brand: aiExtractedFieldSchema.optional(),
  price: aiExtractedFieldSchema.optional(),
  currency: aiExtractedFieldSchema.optional(),
  images: aiExtractedFieldSchema.optional(),
  description: aiExtractedFieldSchema.optional(),
  availability: aiExtractedFieldSchema.optional(),
  sku: aiExtractedFieldSchema.optional(),
  productId: aiExtractedFieldSchema.optional(),
  colors: aiExtractedFieldSchema.optional(),
  sizes: aiExtractedFieldSchema.optional()
});

export type AiProductExtraction = z.infer<typeof aiProductExtractionSchema>;
