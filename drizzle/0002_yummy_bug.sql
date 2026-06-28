ALTER TYPE "public"."categoria_producto" ADD VALUE 'extras';--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "para_llevar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "nombre_cliente_llevar" text;--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "motivo_cancelacion" text;