export interface AuthUser {
  userId: number;
  username: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
}
