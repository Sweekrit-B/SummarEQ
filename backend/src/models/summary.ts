import { InferSchemaType, Schema, model, Types } from "mongoose";

const summarySchema = new Schema({
  firstName: { type: String, required: false },
  lastName: { type: String, required: false },
  email: { type: String, required: false },
  phone: { type: String, required: false },
  locationId: { type: String, required: true },
  contactId: { type: String, required: true },
  messageTypes: { type: [String], required: false },
  messageBodies: { type: [String], required: false },
  timestamps: { type: [Date], default: Date.now, required: false },
  summary: { type: String, required: false },
  clientContext: { type: String, required: false },
});

type Summary = InferSchemaType<typeof summarySchema>;
export default model<Summary>("Summary", summarySchema);
