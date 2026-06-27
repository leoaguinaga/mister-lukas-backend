CREATE TYPE "public"."tipo_descuento" AS ENUM('porcentaje', 'monto_fijo');--> statement-breakpoint
ALTER TYPE "public"."tipo_plato" ADD VALUE 'refresco';--> statement-breakpoint
ALTER TYPE "public"."tipo_plato" ADD VALUE 'bebida';--> statement-breakpoint
ALTER TYPE "public"."tipo_plato" ADD VALUE 'coctel';--> statement-breakpoint
CREATE TABLE "promocion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"tipo_descuento" "tipo_descuento" NOT NULL,
	"valor_descuento" numeric(10, 2) NOT NULL,
	"dias_semana" text NOT NULL,
	"hora_inicio" time,
	"hora_fin" time,
	"vigente_desde" date,
	"vigente_hasta" date,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promocion_plato" (
	"promocion_id" uuid NOT NULL,
	"plato_carta_id" uuid NOT NULL,
	CONSTRAINT "promocion_plato_promocion_id_plato_carta_id_pk" PRIMARY KEY("promocion_id","plato_carta_id")
);
--> statement-breakpoint
ALTER TABLE "item_pedido" ADD COLUMN "descuento_unitario" text DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_pedido" ADD COLUMN "promocion_aplicada_id" uuid;--> statement-breakpoint
ALTER TABLE "promocion_plato" ADD CONSTRAINT "promocion_plato_promocion_id_promocion_id_fk" FOREIGN KEY ("promocion_id") REFERENCES "public"."promocion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promocion_plato" ADD CONSTRAINT "promocion_plato_plato_carta_id_plato_carta_id_fk" FOREIGN KEY ("plato_carta_id") REFERENCES "public"."plato_carta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_promocion_aplicada_id_promocion_id_fk" FOREIGN KEY ("promocion_aplicada_id") REFERENCES "public"."promocion"("id") ON DELETE set null ON UPDATE no action;