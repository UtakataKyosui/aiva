CREATE TABLE "subscription_services" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_products" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"stock_quantity" double precision NOT NULL,
	"stock_unit" text NOT NULL,
	"calories" double precision,
	"protein" double precision,
	"fat" double precision,
	"carbs" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_shortcuts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service_id" text,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_shortcut_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shortcut_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_services" ADD CONSTRAINT "subscription_services_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_products" ADD CONSTRAINT "subscription_products_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_products" ADD CONSTRAINT "subscription_products_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_shortcuts" ADD CONSTRAINT "meal_shortcuts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_shortcuts" ADD CONSTRAINT "meal_shortcuts_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_shortcut_items" ADD CONSTRAINT "meal_shortcut_items_shortcut_id_meal_shortcuts_id_fk" FOREIGN KEY ("shortcut_id") REFERENCES "public"."meal_shortcuts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_shortcut_items" ADD CONSTRAINT "meal_shortcut_items_product_id_subscription_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."subscription_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "shortcut_id" text;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "calories" double precision;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "protein" double precision;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "fat" double precision;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "carbs" double precision;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "consumed_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_shortcut_id_meal_shortcuts_id_fk" FOREIGN KEY ("shortcut_id") REFERENCES "public"."meal_shortcuts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "subscription_services_user_id_idx" ON "subscription_services" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "subscription_products_user_id_idx" ON "subscription_products" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "subscription_products_service_id_idx" ON "subscription_products" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX "meal_shortcuts_user_id_idx" ON "meal_shortcuts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "meal_shortcuts_service_id_idx" ON "meal_shortcuts" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX "meal_shortcut_items_shortcut_id_idx" ON "meal_shortcut_items" USING btree ("shortcut_id");
--> statement-breakpoint
CREATE INDEX "meal_shortcut_items_product_id_idx" ON "meal_shortcut_items" USING btree ("product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "meal_shortcut_items_shortcut_product_idx" ON "meal_shortcut_items" USING btree ("shortcut_id","product_id");
--> statement-breakpoint
CREATE INDEX "meal_logs_shortcut_id_idx" ON "meal_logs" USING btree ("shortcut_id");
