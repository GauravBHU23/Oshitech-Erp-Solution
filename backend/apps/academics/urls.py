from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register("courses", views.CourseViewSet, basename="course")
router.register("subjects", views.SubjectViewSet, basename="subject")
router.register("classrooms", views.ClassRoomViewSet, basename="classroom")
router.register("teaching-assignments", views.TeachingAssignmentViewSet, basename="teaching-assignment")
urlpatterns = router.urls
