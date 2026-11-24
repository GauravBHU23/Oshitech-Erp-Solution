from getpass import getpass
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

User = get_user_model()

accounts = [
    ("gauravkum1275@gmail.com", "super_admin"),
    ("gauravkum1275+teacher@gmail.com", "teacher"),
    ("gauravkum1275+schooladmin@gmail.com", "school_admin"),
    ("gauravkum1275+examcontroller@gmail.com", "exam_controller"),
    ("gauravkum1275+stre@gmail.com", "stre_admin"),
]

for email, role in accounts:
    if User.objects.filter(email=email).exists():
        print("Already exists, skipped:", email)
        continue

    while True:
        password = getpass("New password for " + email + ": ")
        confirm = getpass("Confirm password: ")

        if password != confirm:
            print("Passwords do not match.")
            continue

        try:
            validate_password(password, User(email=email))
            break
        except ValidationError as error:
            print("Password requirements:")
            for message in error.messages:
                print(message)

    if role == "super_admin":
        User.objects.create_superuser(email=email, password=password)
    else:
        User.objects.create_user(email=email, password=password, role=role)

    print("CREATED:", email, role)

print("ACCOUNT CREATION FINISHED")
