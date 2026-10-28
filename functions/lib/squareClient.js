import { SquareClient, SquareEnvironment } from "square";

let squareClient = null;

function getSquareClient() {
    return squareClient
        ? squareClient
        : (squareClient = new SquareClient({
              token: process.env.SQUARE_ACCESS_TOKEN,
              environment: SquareEnvironment.Production,
          }));
}

export default getSquareClient;
