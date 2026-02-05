import os
import pandas as pd
SERVER_OLD = os.getenv("SERVER_OLD", "")
DATABASE_OLD = os.getenv("DATABASE_OLD", "")
USERNAME_OLD = os.getenv("USERNAME_OLD", "")
PASSWORD_OLD = os.getenv("PASSWORD_OLD", "")


QUERY_NEGOCIADOR_BY_CPF = """desselect distinct
	M.MoInadimplentesID,
	dbo.RetornaNomeRazaoSocial(M.MoInadimplentesID)Cliente,
	PC.PesDDD + PC.PesTelefone Telefone,
	sum(MoValorDocumento)Valor,
	DATEDIFF(d,min(MoDataVencimento),getdate())Aging
from Candiotto_STD.dbo.Movimentacoes M
	inner join Candiotto_STD.dbo.PessoasContatos PC on M.MoInadimplentesID = PC.PesPessoasID
where
	M.MoCampanhasID in (33,74)
	and M.MoStatusMovimentacao = 0
	and M.MoDataVencimento < getdate()
	and M.MoOrigemMovimentacao in ('I','C')
	and not exists (
		SELECT 1
		FROM Candiotto_STD.dbo.Movimentacoes mA
		WHERE mA.MoInadimplentesID    = m.MoInadimplentesID
		  and mA.MoCampanhasID        = m.MoCampanhasID
		  and mA.MoOrigemMovimentacao = 'A'
		  and mA.MoStatusMovimentacao = 0
	)
	AND (PesTelefoneInativo = 0 OR PesTelefoneInativo IS NULL)
    AND PesTelefone IS NOT NULL
    AND PesTelefone <> ''
    AND LEN(PesTelefone) = 9
    AND LEFT(PesTelefone, 1) = '9'
    AND LEN(PesDDD) = 2
group by
	M.MoInadimplentesID,
	dbo.RetornaNomeRazaoSocial(M.MoInadimplentesID),
	PC.PesDDD + PC.PesTelefone
order by 5 asc, 4 desc"""

CONTACT_MESSAGE = ("olar, bro!!")

df = pd.DataFrame(
    [
        ["5531991376705", 0, True],
        ["55 41 9723-3448", 0, False],
    ],
    columns=["Telefone", "col2", "col3"]
)