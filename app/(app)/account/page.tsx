import { requireUser } from "@/lib/auth";
import PageTitle from "@/components/PageTitle";
import PasswordForm from "@/components/PasswordForm";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageTitle title="Your account" sub={user.email} />
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Change your password</h2>
        <PasswordForm />
      </section>
    </>
  );
}
