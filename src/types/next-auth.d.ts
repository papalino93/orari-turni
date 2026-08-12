import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name: string;
      username: string;
    };
  }
  interface User {
    username: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username: string;
  }
}
