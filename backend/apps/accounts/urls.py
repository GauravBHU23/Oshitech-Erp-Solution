from django.urls import path
from rest_framework.routers import DefaultRouter

from . import password_reset, views

router = DefaultRouter()
router.register("registration-requests", views.RegistrationRequestViewSet, basename="registration-request")

urlpatterns = [
    path("csrf/", views.CsrfView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("refresh/", views.RefreshView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("change-password/", views.PasswordChangeView.as_view()),
    path("forgot-password/", password_reset.PasswordResetRequestView.as_view()),
    path("forgot-password/confirm/", password_reset.PasswordResetConfirmView.as_view()),
    path("me/", views.MeView.as_view()),
    path("users/", views.AccountDirectoryView.as_view()),
    path("users/<uuid:user_id>/", views.AccountManagementView.as_view()),
    path("users/<uuid:user_id>/<str:action_name>/", views.AccountManagementActionView.as_view()),
    path("profile/", views.ProfileView.as_view()),
    path("profile-photos/<uuid:user_id>/", views.ProfilePhotoView.as_view()),
    path("registration-photos/<uuid:registration_id>/", views.RegistrationPhotoView.as_view()),
    path("registration-options/", views.RegistrationOptionsView.as_view()),
    path("register/", views.RegistrationCreateView.as_view()),
] + router.urls
