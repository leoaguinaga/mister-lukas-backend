CREATE TABLE "gasto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turno_caja_id" uuid NOT NULL,
	"cajero_usuario_id" text NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"motivo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_turno_caja_id_turno_caja_id_fk" FOREIGN KEY ("turno_caja_id") REFERENCES "public"."turno_caja"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_cajero_usuario_id_user_id_fk" FOREIGN KEY ("cajero_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;