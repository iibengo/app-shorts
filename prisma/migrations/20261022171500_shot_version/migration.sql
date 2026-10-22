-- Shot-level optimistic version for conditional lease claims.
ALTER TABLE "Shot" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
