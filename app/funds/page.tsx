import { redirect } from "next/navigation";

// The fund summary now lives on the home page; individual fund pages remain at /funds/[id].
export default function FundsPage() {
  redirect("/");
}
