-- CreateTable
CREATE TABLE "UtmifyConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'Trilho',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtmifyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UtmifyConfig_userId_key" ON "UtmifyConfig"("userId");

-- AddForeignKey
ALTER TABLE "UtmifyConfig" ADD CONSTRAINT "UtmifyConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
