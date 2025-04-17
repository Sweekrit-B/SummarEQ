import { InferSchemaType, Schema, model, Types } from "mongoose";

const installSchema = new Schema({
  appId: { type: String, required: true },
  installType: { type: String, required: true },
  locationId: { type: String, required: true },
  companyId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  webhookId: { type: String, required: true },
});

type Install = InferSchemaType<typeof installSchema>;
export default model<Install>("Install", installSchema);
