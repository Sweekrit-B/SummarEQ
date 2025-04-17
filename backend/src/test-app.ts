//Require express and body-parser
import express from "express";
import bodyParser from "body-parser";

//Initialize express and define a port for the test endpoint
const app = express();
const PORT = 4000;

//Tell express to user body-parser's JSON parsing
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.post("/test-endpoint", (req, res) => {
  console.log("Received: ", req.body);
  res.status(200).send("OK");
});

//Start express on the defined port
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
export default app;
