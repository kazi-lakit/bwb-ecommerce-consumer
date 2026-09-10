import { blocksFetch } from "./http";

export interface BlocksUser {
  itemId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  roles: string[];
  permissions: string[];
  active: boolean;
  profileImageUrl?: string;
  organizationId?: string;
}

export const usersApi = {
  me: () => blocksFetch<{ data: BlocksUser }>(`/iam/v4/iam/me`).then((r) => r.data),
};
