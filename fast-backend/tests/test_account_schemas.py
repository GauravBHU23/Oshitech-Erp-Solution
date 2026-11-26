import unittest
import uuid
from types import SimpleNamespace

from app.accounts.schemas import UserOut


class UserOutTests(unittest.TestCase):
    def test_school_field_uses_orm_school_id_and_keeps_api_name(self):
        user = SimpleNamespace(
            id=uuid.uuid4(),
            email="test@example.invalid",
            first_name="Test",
            last_name="User",
            role="super_admin",
            school_id=None,
            phone="",
            profile_photo="",
        )

        result = UserOut.model_validate(user).model_dump()

        self.assertIn("school", result)
        self.assertIsNone(result["school"])
        self.assertNotIn("school_id", result)
