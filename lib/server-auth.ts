import { auth } from "@/auth";

type SessionUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  iat?: number;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return null;
  }

  return {
    id: user.id,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    role: user.role,
    iat: user.iat,
  };
}
