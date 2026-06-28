CREATE TYPE "public"."categoria_producto" AS ENUM('pollo_a_la_brasa', 'entradas', 'platos_a_la_carta', 'parrillas', 'parrillas_familiares', 'pastas', 'guarniciones', 'refrescos_jugos', 'bebidas', 'cocteles');--> statement-breakpoint
CREATE TYPE "public"."estado_item_pedido" AS ENUM('pendiente', 'listo', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."estado_mesa" AS ENUM('libre', 'ocupada');--> statement-breakpoint
CREATE TYPE "public"."estado_pedido" AS ENUM('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."estado_visita" AS ENUM('abierta', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_turno_caja" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'tarjeta', 'yape_plin', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."estado_sync" AS ENUM('pendiente', 'sincronizado', 'error');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_stock" AS ENUM('venta', 'ajuste_manual', 'apertura_dia');--> statement-breakpoint
CREATE TYPE "public"."tipo_descuento" AS ENUM('porcentaje', 'monto_fijo');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"unidades_por_unidad_compra" integer DEFAULT 1 NOT NULL,
	"nombre_unidad_minima" text DEFAULT 'unidad' NOT NULL,
	"stock_actual" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plato_carta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" numeric(10, 2) NOT NULL,
	"categoria" "categoria_producto" NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receta_plato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plato_carta_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"cantidad_consumida" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"plato_carta_id" uuid NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio_unitario_congelado" text NOT NULL,
	"descuento_unitario" text DEFAULT '0.00' NOT NULL,
	"promocion_aplicada_id" uuid,
	"notas" text,
	"estado" "estado_item_pedido" DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer NOT NULL,
	"estado" "estado_mesa" DEFAULT 'libre' NOT NULL,
	"capacidad" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mesa_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_mesa_id" uuid NOT NULL,
	"tomado_por_usuario_id" text NOT NULL,
	"estado" "estado_pedido" DEFAULT 'pendiente' NOT NULL,
	"fecha_creacion" timestamp DEFAULT now() NOT NULL,
	"fecha_listo" timestamp,
	"fecha_entregado" timestamp
);
--> statement-breakpoint
CREATE TABLE "visita_mesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mesa_id" uuid NOT NULL,
	"abierta_por_usuario_id" text NOT NULL,
	"estado" "estado_visita" DEFAULT 'abierta' NOT NULL,
	"para_llevar" boolean DEFAULT false NOT NULL,
	"fecha_apertura" timestamp DEFAULT now() NOT NULL,
	"fecha_cierre" timestamp
);
--> statement-breakpoint
CREATE TABLE "pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turno_caja_id" uuid NOT NULL,
	"visita_mesa_id" uuid NOT NULL,
	"registrado_por_usuario_id" text NOT NULL,
	"metodo_pago" "metodo_pago" NOT NULL,
	"monto_total" numeric(10, 2) NOT NULL,
	"fecha_pago" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turno_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cajero_usuario_id" text NOT NULL,
	"estado" "estado_turno_caja" DEFAULT 'abierto' NOT NULL,
	"monto_apertura" numeric(10, 2) NOT NULL,
	"monto_cierre_teorico" numeric(10, 2),
	"monto_cierre_real" numeric(10, 2),
	"diferencia" numeric(10, 2),
	"fecha_apertura" timestamp DEFAULT now() NOT NULL,
	"fecha_cierre" timestamp
);
--> statement-breakpoint
CREATE TABLE "conteo_stock_diario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"registrado_por_usuario_id" text NOT NULL,
	"stock_inicial_contado" integer NOT NULL,
	"stock_final_teorico" integer,
	"stock_final_contado" integer,
	"merma" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimiento_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"tipo" "tipo_movimiento_stock" NOT NULL,
	"cantidad" integer NOT NULL,
	"item_pedido_id" uuid,
	"registrado_por_usuario_id" text,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_diario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"estado" "estado_sync" DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ultimo_error" text,
	"sincronizado_en" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_diario_fecha_unique" UNIQUE("fecha")
);
--> statement-breakpoint
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_plato" ADD CONSTRAINT "receta_plato_plato_carta_id_plato_carta_id_fk" FOREIGN KEY ("plato_carta_id") REFERENCES "public"."plato_carta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_plato" ADD CONSTRAINT "receta_plato_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_plato_carta_id_plato_carta_id_fk" FOREIGN KEY ("plato_carta_id") REFERENCES "public"."plato_carta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_promocion_aplicada_id_promocion_id_fk" FOREIGN KEY ("promocion_aplicada_id") REFERENCES "public"."promocion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_visita_mesa_id_visita_mesa_id_fk" FOREIGN KEY ("visita_mesa_id") REFERENCES "public"."visita_mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_tomado_por_usuario_id_user_id_fk" FOREIGN KEY ("tomado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD CONSTRAINT "visita_mesa_mesa_id_mesa_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_mesa" ADD CONSTRAINT "visita_mesa_abierta_por_usuario_id_user_id_fk" FOREIGN KEY ("abierta_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_turno_caja_id_turno_caja_id_fk" FOREIGN KEY ("turno_caja_id") REFERENCES "public"."turno_caja"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_visita_mesa_id_visita_mesa_id_fk" FOREIGN KEY ("visita_mesa_id") REFERENCES "public"."visita_mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_registrado_por_usuario_id_user_id_fk" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_cajero_usuario_id_user_id_fk" FOREIGN KEY ("cajero_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteo_stock_diario" ADD CONSTRAINT "conteo_stock_diario_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteo_stock_diario" ADD CONSTRAINT "conteo_stock_diario_registrado_por_usuario_id_user_id_fk" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_registrado_por_usuario_id_user_id_fk" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promocion_plato" ADD CONSTRAINT "promocion_plato_promocion_id_promocion_id_fk" FOREIGN KEY ("promocion_id") REFERENCES "public"."promocion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promocion_plato" ADD CONSTRAINT "promocion_plato_plato_carta_id_plato_carta_id_fk" FOREIGN KEY ("plato_carta_id") REFERENCES "public"."plato_carta"("id") ON DELETE cascade ON UPDATE no action;