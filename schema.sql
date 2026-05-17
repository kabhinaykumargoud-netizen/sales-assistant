-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Business Table
CREATE TABLE "Business" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "plan" TEXT DEFAULT 'free',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Table
CREATE TABLE "Agent" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT DEFAULT 'agent',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product Table
CREATE TABLE "Product" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "discountPrice" DOUBLE PRECISION,
    "stock" INTEGER DEFAULT 0,
    "category" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bundle Table
CREATE TABLE "Bundle" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- BundleItem Table
CREATE TABLE "BundleItem" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "bundleId" UUID REFERENCES "Bundle"(id) ON DELETE CASCADE,
    "productId" UUID REFERENCES "Product"(id) ON DELETE CASCADE,
    "quantity" INTEGER DEFAULT 1
);

-- Lead Table
CREATE TABLE "Lead" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "language" TEXT,
    "stage" TEXT DEFAULT 'new',
    "status" TEXT DEFAULT 'active',
    "intentScore" INTEGER DEFAULT 0,
    "lifetimeValue" DOUBLE PRECISION DEFAULT 0,
    "orderCount" INTEGER DEFAULT 0,
    "tags" TEXT,
    "notes" TEXT,
    "lostReason" TEXT,
    "source" TEXT,
    "assignedAgentId" UUID,
    "lastContactedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- StageHistory Table
CREATE TABLE "StageHistory" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "leadId" UUID REFERENCES "Lead"(id) ON DELETE CASCADE,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "changedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "reason" TEXT
);

-- Message Table
CREATE TABLE "Message" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "leadId" UUID REFERENCES "Lead"(id) ON DELETE CASCADE,
    "agentId" UUID REFERENCES "Agent"(id) ON DELETE SET NULL,
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT DEFAULT 'text',
    "status" TEXT DEFAULT 'sent',
    "isAiGenerated" BOOLEAN DEFAULT false,
    "aiScore" DOUBLE PRECISION,
    "sentiment" TEXT,
    "intentScore" INTEGER,
    "readAt" TIMESTAMP WITH TIME ZONE,
    "deliveredAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MessageItem Table
CREATE TABLE "MessageItem" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "messageId" UUID REFERENCES "Message"(id) ON DELETE CASCADE,
    "productId" UUID REFERENCES "Product"(id) ON DELETE CASCADE,
    "quantity" INTEGER DEFAULT 1
);

-- Campaign Table
CREATE TABLE "Campaign" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "segment" TEXT,
    "status" TEXT DEFAULT 'draft',
    "scheduledAt" TIMESTAMP WITH TIME ZONE,
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "sentCount" INTEGER DEFAULT 0,
    "replyCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template Table
CREATE TABLE "Template" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT DEFAULT 'en',
    "usageCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reminder Table
CREATE TABLE "Reminder" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "leadId" UUID REFERENCES "Lead"(id) ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "status" TEXT DEFAULT 'pending',
    "priority" TEXT DEFAULT 'normal',
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enquiry Table
CREATE TABLE "Enquiry" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "leadId" UUID REFERENCES "Lead"(id) ON DELETE CASCADE,
    "productId" UUID REFERENCES "Product"(id) ON DELETE SET NULL,
    "message" TEXT NOT NULL,
    "quantity" INTEGER,
    "budget" DOUBLE PRECISION,
    "status" TEXT DEFAULT 'open',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waitlist Table
CREATE TABLE "Waitlist" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "leadId" UUID REFERENCES "Lead"(id) ON DELETE CASCADE,
    "productId" UUID REFERENCES "Product"(id) ON DELETE CASCADE,
    "notified" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ApiKey Table
CREATE TABLE "ApiKey" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessId" UUID REFERENCES "Business"(id) ON DELETE CASCADE,
    "key" TEXT UNIQUE NOT NULL,
    "name" TEXT,
    "lastUsedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
