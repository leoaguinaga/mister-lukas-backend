CREATE TABLE IF NOT EXISTS "categoria_carta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"descuenta_stock" boolean DEFAULT false NOT NULL,
	"es_para_cocina" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "categoria_carta" ("nombre", "slug", "descuenta_stock", "es_para_cocina", "orden") VALUES
('Pollo a la brasa', 'pollo_a_la_brasa', false, true, 1),
('Entradas', 'entradas', false, true, 2),
('Platos a la carta', 'platos_a_la_carta', false, true, 3),
('Parrillas', 'parrillas', false, true, 4),
('Parrillas Familiares', 'parrillas_familiares', false, true, 5),
('Pastas', 'pastas', false, true, 6),
('Guarniciones', 'guarniciones', false, true, 7),
('Refrescos o Jugos', 'refrescos_jugos', false, false, 8),
('Bebidas', 'bebidas', true, false, 9),
('Cócteles', 'cocteles', false, false, 10),
('Extras', 'extras', false, false, 11)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "plato_carta" ADD COLUMN "categoria_id" uuid;
--> statement-breakpoint
UPDATE "plato_carta" pc
SET "categoria_id" = cc."id"
FROM "categoria_carta" cc
WHERE pc."categoria"::text = cc."slug";
--> statement-breakpoint
ALTER TABLE "plato_carta" ALTER COLUMN "categoria_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plato_carta" ADD CONSTRAINT "plato_carta_categoria_id_categoria_carta_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_carta"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plato_carta" DROP COLUMN IF EXISTS "categoria";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."categoria_producto";
