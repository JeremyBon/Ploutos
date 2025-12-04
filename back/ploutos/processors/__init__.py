"""Transaction processors for automatic categorization."""

from ploutos.processors.simple_split import SimpleSplitProcessor
from ploutos.processors.loan import LoanProcessor

__all__ = ["SimpleSplitProcessor", "LoanProcessor"]
