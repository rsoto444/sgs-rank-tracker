# SGS Rank Tracker

Keyword rankings and website visitors for Soto Growth Systems, Provo SEO Pros and every client site, with a dropdown to switch between them.
Built Sunday 27 September.
**Next action:** deploy it to Vercel (step 1 below).

## What it does

- **Site dropdown** at the top. Agency sites and client sites, grouped.
- **Keywords:** type them in, and DataForSEO checks each one's Google position every day. Search Console adds real clicks and impressions, and suggests searches you already show up for.
- **Visitors:** from a one-line tracking snippet, from Google Analytics 4, or both.
- **Logins:** your team sees every site. Each client gets a login that only sees their own site.

## Set it up

### 1. Deploy to Vercel

- In Vercel, click **Add New**, then **Project**, and pick this repo.
- Before clicking Deploy, go to the **Storage** tab of the project and add a **Neon Postgres** database. It fills in the database address for you.
- Add these under **Settings**, then **Environment Variables**:
  - **AUTH_SECRET** - any long random text, 32+ characters. It locks the login cookie.
  - **ADMIN_EMAIL** and **ADMIN_PASSWORD** - your first login.
  - **CRON_SECRET** - any random text. It protects the daily refresh.
- Deploy. The first deploy creates the database tables, both agency sites and your login.

### 2. Connect DataForSEO (daily positions)

- In DataForSEO, open **API Access** and copy your API login and password.
- Add them in Vercel as **DATAFORSEO_LOGIN** and **DATAFORSEO_PASSWORD**, then redeploy.

### 3. Connect Google (Search Console + GA4)

- In Google Cloud Console, create a project, then turn on **Google Search Console API** and **Google Analytics Data API**.
- Under **IAM**, then **Service Accounts**, create one, open it, go to **Keys** and download a JSON key.
- Paste the whole file into Vercel as **GOOGLE_SERVICE_ACCOUNT_JSON**, then redeploy.
- The app's **Connections** page shows the service account's email. Add that email as a user in Search Console and in GA4 for each site.

### 4. Add the tracking snippet to each site

- Open **Sites**, pick a site, copy the snippet and paste it into the site's head section.

## Adding a client

- **Sites** page, fill in **Add a site**, choose **Client site**.
- **Logins** page, create their login, tick their site, send them the link and temporary password.
