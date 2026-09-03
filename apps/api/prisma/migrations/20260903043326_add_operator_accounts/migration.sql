-- CreateTable
CREATE TABLE "operator_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_sessions" (
    "id" TEXT NOT NULL,
    "operator_account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operator_accounts_email_key" ON "operator_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "operator_sessions_token_hash_key" ON "operator_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "operator_sessions_operator_account_id_idx" ON "operator_sessions"("operator_account_id");

-- CreateIndex
CREATE INDEX "operator_sessions_expires_at_idx" ON "operator_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_operator_account_id_fkey" FOREIGN KEY ("operator_account_id") REFERENCES "operator_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
