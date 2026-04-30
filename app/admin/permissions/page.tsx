import { redirect } from "next/navigation";

/** Legacy route; permission management lives on the user directory. */
export default function AdminPermissionsPage() {
  redirect("/admin/users");
}
