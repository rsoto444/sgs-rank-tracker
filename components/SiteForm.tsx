"use client";
import { useActionState } from "react";
import { saveSite } from "@/app/(app)/actions";
import FormMessage from "./FormMessage";

type SiteValues = {
  id?: number;
  name?: string;
  domain?: string;
  kind?: string;
  gsc_property?: string | null;
  ga4_property_id?: string | null;
  location_code?: number;
  language_code?: string;
};

export default function SiteForm({ site = {} }: { site?: SiteValues }) {
  const [message, action, pending] = useActionState(saveSite, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {site.id && <input type="hidden" name="id" value={site.id} />}
      <div>
        <label className="label" htmlFor="name">Business name</label>
        <input className="input" id="name" name="name" defaultValue={site.name} required />
      </div>
      <div>
        <label className="label" htmlFor="domain">Domain</label>
        <input className="input" id="domain" name="domain" defaultValue={site.domain} placeholder="example.com" required />
      </div>
      <div>
        <label className="label" htmlFor="kind">Type</label>
        <select className="input" id="kind" name="kind" defaultValue={site.kind ?? "client"}>
          <option value="client">Client site</option>
          <option value="agency">Agency site (ours)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="location_code">Where to check rankings</label>
        <input className="input" id="location_code" name="location_code" type="number" defaultValue={site.location_code ?? 2840} />
        <p className="mt-1 text-xs text-ink-3">
          2840 = United States. For a city, find its code in{" "}
          <a className="underline" href="https://docs.dataforseo.com/v3/serp/google/locations/" target="_blank" rel="noreferrer">DataForSEO&apos;s location list</a>.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="gsc_property">Search Console property</label>
        <input className="input" id="gsc_property" name="gsc_property" defaultValue={site.gsc_property ?? ""} placeholder="sc-domain:example.com (filled in for you)" />
        <p className="mt-1 text-xs text-ink-3">Use sc-domain:example.com for a domain property, or the full https:// address for a URL property.</p>
      </div>
      <div>
        <label className="label" htmlFor="ga4_property_id">GA4 property ID (optional)</label>
        <input className="input" id="ga4_property_id" name="ga4_property_id" defaultValue={site.ga4_property_id ?? ""} placeholder="412345678" />
        <p className="mt-1 text-xs text-ink-3">In GA4: Admin, then Property details. The number in the top right.</p>
      </div>
      <input type="hidden" name="language_code" value={site.language_code ?? "en"} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending}>{pending ? "Saving..." : site.id ? "Save changes" : "Add site"}</button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
