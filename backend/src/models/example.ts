import { InferSchemaType, Schema, model, Types } from "mongoose";

const exampleSchema = new Schema({
  first_name: { type: String, required: false },
  last_name: { type: String, required: false },
  email: { type: String, required: false },
  phone: { type: String, required: false },
  message_type: { type: String, required: false },
  message_body: { type: String, required: false },
  summary: { type: String, required: false },
});

type Example = InferSchemaType<typeof exampleSchema>;
export default model<Example>("Example", exampleSchema);
