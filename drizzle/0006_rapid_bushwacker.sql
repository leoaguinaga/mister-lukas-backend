CREATE TYPE "public"."tipo_visita" AS ENUM('mesa', 'llevar', 'delivery');--> statement-breakpoint
ALTER TABLE "visita_mesa" ALTER COLUMN "mesa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD COLUMN "tipo" "tipo_visita" DEFAULT 'mesa' NOT NULL;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD COLUMN "nombre_cliente" text;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD COLUMN "telefono_cliente" text;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD COLUMN "direccion_delivery" text;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD COLUMN "costo_envio" numeric(10, 2);