# PLOUTOS

Ploutos is a personal finance management application designed to help users track their expenses, manage accounts, and gain insights into their financial habits. It features a backend API built with FastAPI and a Next.js frontend for a modern user experience. Ploutos leverages GoCardless for bank account aggregation.

## Technologies Used
This project is built with a modern tech stack:
*   **Backend:** FastAPI (Python), Poetry for dependency management.
*   **Frontend:** Next.js (React, TypeScript).
*   **Database & Backend Services:** Supabase
*   **Bank Account Aggregation:** GoCardless API.

## Project Structure
The project is organized into the following main directories:
*   `ploutos/`: Contains the backend application built with FastAPI.
    *   `api/`: Handles API routing and logic. Key subdirectories include `routers/` for request handling.
    *   `db/`: Manages database interactions (models defined in `models.py`).
    *   `config/`: Stores configuration settings (e.g., `settings.py`).
*   `ploutos-front/`: Contains the frontend application built with Next.js.
    *   `src/app/`: Core application pages (e.g., `page.tsx`, `layout.tsx`) and components.
    *   `public/`: Static assets like images and icons.
*   `diagrams/`: Contains project diagrams, such as ER diagrams (`diagramme_ER.md`) or process flows (`process_db.excalidraw`).

## Installation

- Next.js: Run the following command or refer to the Next.js [installation guide](https://nextjs.org/docs/app/getting-started/installation).
    ```bash
    npx create-next-app@latest
    ```

## Run the project

In one terminal, run the following command to start the Next.js frontend server:
```bash
cd ploutos-front && npm run dev 
```

In another terminal, run the following command to start the FastAPI backend server:
```bash
cd ploutos && poetry run uvicorn api.main:app --reload --log-level debug
```

Go to the following URL to access the website:
```
http://localhost:3000
```
and on the following url to access the API:
```
http://localhost:8000/docs
```

## Bank Account Aggregation

Bank account aggregation in Ploutos allows users to connect their various bank accounts to the application, providing a consolidated view of their finances. This enables comprehensive expense tracking and financial analysis.

Ploutos uses GoCardless for bank account aggregation. GoCardless was chosen because it is widely used, offers a good free tier, and supports a wide range of bank integrations. ([Reddit Discussion](https://www.reddit.com/r/vosfinances/comments/1f3zw6j/liste_des_transactions_via_api_open_banking/))

Other alternatives that were considered include:
* Plaid
* Tink.io
* powens.com
* saltedge

Additionally, other open-source open banking projects exist, such as: [Firefly III](https://www.firefly-iii.org/). It seems to use GoCardless and SaltEdge.

**Current Limitations**
A current limitation with GoCardless is the lack of a solution for Natixis Interépargne and Lydia. Tricount does not have an account in any case.

## Frequently Asked Questions (FAQ)

### How do I re-authenticate my bank connection?
To maintain access to your bank data, connections typically need to be re-authenticated every 90 days. Follow these steps:
1. Visit the [GoCardless Bank Account Data portal](https://bankaccountdata.gocardless.com/data/) and log in.
2. Re-establish the connection to your bank if prompted, or verify that your existing connection is active.
3. If you need to update the account ID in Ploutos: after selecting your bank and account on the GoCardless portal, the URL in your browser will typically end with the account ID. Copy this ID.
4. Update the corresponding account ID within Ploutos where necessary.

## API Documentation

To access the Swagger API documentation, visit:
```
http://localhost:8000/docs
```

## Contributing
We welcome contributions to Ploutos! If you'd like to contribute, please follow these general steps:
1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes.
4.  Submit a pull request for review.

**Commit Messages:** Please ensure your commit messages adhere to the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/). This helps maintain a clear and understandable commit history.

## License
This project is licensed under the CC BY-NC-ND 4.0 License. See the `Licence` file for full details.
